import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import {
  AppError,
  isReservedEvidencePathSegment,
  type CertificateDefinitionCompetencyRequirement,
  type CertificateDefinitionEvidencePolicy,
  type CertificateDefinitionPresentation,
  type CurriculumPublicationState,
  type EvidenceSourceType,
  normalizeCertificatePortfolioFilters
} from "@tlp/shared-types";
import {
  getAssessmentAttempt,
  saveAssessmentAnswer,
  startAssessmentAttempt,
  submitAssessmentAttempt
} from "./assessment-attempts";
import { listPublishedAssessments } from "./assessments";
import { getReadinessAssessmentOutcome } from "./readiness";
import { interruptAssessmentAttempt, resumeInterruptedAssessmentAttempt } from "./assessment-recovery";
import { resolveTrustedRequestIdentity } from "./auth-context";
import { requireFounderAdmin } from "./authorization";
import { loadRuntimeConfig, validateRuntimeConfig } from "./config";
import { resolveCors } from "./cors";
import { describeUnexpectedError } from "./db-diagnostics";
import {
  addCompetencyPrerequisite,
  createDraftCompetency,
  createDraftCourse,
  createDraftLearningPath,
  createDraftMission,
  createDraftModule,
  linkMissionCompetency,
  transitionLearningPathState,
  updateDraftLearningPath,
  validateLearningPathForPublication
} from "./curriculum-admin";
import {
  addLabValidationChecks,
  createDraftLabDefinition,
  transitionLabDefinitionState,
  transitionLabValidationProfileState,
  type CreateLabDefinitionInput
} from "./lab-admin";
import type {
  LabPublicationState,
  MissionCompetencyRelationship
} from "@tlp/shared-types";
import {
  createDraftCertificateDefinition,
  getCertificateDefinition,
  listCertificateDefinitions,
  setCertificateDefinitionCompetencies,
  setCertificateDefinitionEvidencePolicies,
  supersedeCertificateDefinition,
  transitionCertificateDefinitionState,
  updateCertificateDefinition,
  validateCertificateDefinitionForPublication
} from "./certificate-admin";
import {
  getStudentCertificateEligibility,
  listSelectableCertificateDefinitions
} from "./certificate-eligibility";
import { issueStudentCertificate } from "./certificate-issuance";
import { listStudentCertificateRecords } from "./certificate-lifecycle";
import { verifyCertificateByReference } from "./certificate-verification";
import { getStudentCertificatePortfolio } from "./certificate-portfolio";
import { exportStudentCertificates } from "./certificate-export";
import { getStudentCertificatePresentation } from "./certificate-presentation";
import {
  applyCertificateCorrection,
  listCertificateCorrections
} from "./certificate-correction";
import {
  getPublishedLearningPathTree,
  listPublishedLearningPaths
} from "./curriculum";
import { getApiHealthDetails } from "./health";
import {
  getRecommendedNextAction,
  listLearningHistory,
  listReviewState
} from "./learning-guidance";
import { listStudentCompetencyState } from "./competency";
import {
  getLearningPathProgress,
  recordMissionProgressAction
} from "./learning-progress";
import {
  evaluateMissionPrerequisites,
  getResumeTarget
} from "./learning-navigation";
import { readJsonBody } from "./http-body";
import { sendJson } from "./http-utils";
import { log } from "./logger";
import { createRequestContext } from "./request-context";
import { createStudentNote, deleteStudentNote, getStudentNote, listStudentNotes, updateStudentNote } from "./notes";
import { createStudentTag, deleteStudentTag, listNoteBlocks, listStudentTags, renameStudentTag, replaceNoteBlocks, replaceNoteTags, setNotePinned } from "./note-organization";
import { createStudentBookmark, deleteStudentBookmark, listStudentBookmarks, searchStudentNotes } from "./note-retrieval";
import { buildStudentNoteExport, serializeStudentNoteExport } from "./note-export";
import { mockLabProvider } from "./mock-lab-provider";
import { sendLabProviderCatalog } from "./lab-provider-routes";
import { endLabSession, getLabSession, listLabSessions, requestLabSession, startLabSession } from "./lab-sessions";
import { getLabAccessDelivery, listLabValidationRuns, resetLabSession, validateLabSession } from "./lab-runtime";
import { attestLabIsolation, cleanupLabSessionResources, expireLabSession, listLabOperations, recoverLabSession } from "./lab-operations";
import { getCanonicalEvidenceForStudent, listStudentEvidence } from "./evidence";
import { listCompetencyEvidenceLinks, listEvidenceCompetencyLinks } from "./evidence-competency";
import { getAssessmentAttemptEvidenceId } from "./assessment-evidence";
import { listLabSessionEvidenceIds } from "./lab-evidence";
import {
  appendEvidenceCorrection,
  getEvidenceCorrectionHistory,
  getStudentEvidenceCorrectionHistory
} from "./evidence-correction";
import { getStudentEvidencePortfolio } from "./evidence-portfolio";
import { searchCurriculum } from "./curriculum-search";
import {
  projectCurriculumFreshnessDocuments,
  runSearchFreshnessReconciliation
} from "./search-freshness";
import { describeSearchFreshnessStatus } from "@tlp/shared-types";
import { exportStudentEvidence } from "./evidence-export";

const config = validateRuntimeConfig(loadRuntimeConfig());

function getCorrelationHeader(request: IncomingMessage): string | undefined {
  const value = request.headers["x-correlation-id"];
  if (Array.isArray(value)) return value[0];
  return value;
}

/**
 * The request `Origin`, normalised to a single value.
 *
 * Node types a header as `string | string[]`. A duplicated `Origin` is not a
 * legitimate browser request, so a repeated header resolves to `undefined`
 * rather than picking one — an ambiguous origin is treated as no origin, which
 * grants nothing.
 */
function readOriginHeader(request: IncomingMessage): string | undefined {
  const value = request.headers.origin;
  if (Array.isArray(value)) return undefined;
  return value;
}

function statusCodeForError(error: AppError): number {
  switch (error.code) {
    case "VALIDATION_ERROR": return 400;
    case "UNAUTHORIZED": return 401;
    case "FORBIDDEN": return 403;
    case "NOT_FOUND": return 404;
    case "CONFLICT": return 409;
    case "RATE_LIMITED": return 429;
    case "DEPENDENCY_UNAVAILABLE": return 503;
    default: return 500;
  }
}

function asPublicationState(value: unknown): CurriculumPublicationState {
  if (
    value === "draft" ||
    value === "review" ||
    value === "published" ||
    value === "retired"
  ) return value;

  throw new AppError({
    code: "VALIDATION_ERROR",
    message: "Invalid publication state",
    retryable: false
  });
}

async function founder(request: IncomingMessage) {
  return requireFounderAdmin(await resolveTrustedRequestIdentity(request));
}

function asArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) {
    throw new AppError({
      code: "VALIDATION_ERROR",
      message: "Expected an array",
      retryable: false
    });
  }

  return value as Record<string, unknown>[];
}

/**
 * Transport coercion only. Every certificate rule — stable id shape, exact
 * competency version, expiration window, boolean policy — is enforced by the
 * shared validators inside certificate-admin, never here.
 */
function asCompetencyRequirements(
  value: unknown
): CertificateDefinitionCompetencyRequirement[] {
  return asArray(value).map((entry) => ({
    competencyStableId: String(entry.competencyStableId ?? ""),
    competencyVersion: Number(entry.competencyVersion),
    required: entry.required === undefined ? true : Boolean(entry.required)
  }));
}

function asEvidencePolicies(
  value: unknown
): CertificateDefinitionEvidencePolicy[] {
  return asArray(value).map((entry) => ({
    evidenceSourceType: entry.evidenceSourceType as EvidenceSourceType,
    minimumCount: Number(entry.minimumCount),
    requirePositiveOutcome:
      entry.requirePositiveOutcome === undefined
        ? true
        : Boolean(entry.requirePositiveOutcome)
  }));
}

function asPresentation(value: unknown): CertificateDefinitionPresentation {
  const presentation = (value ?? {}) as Record<string, unknown>;

  return {
    plainLanguageTitle: String(presentation.plainLanguageTitle ?? ""),
    ...(presentation.plainLanguageSummary === undefined
      ? {}
      : { plainLanguageSummary: String(presentation.plainLanguageSummary) }),
    ...(presentation.logoTextAlternative === undefined
      ? {}
      : { logoTextAlternative: String(presentation.logoTextAlternative) })
  };
}

/**
 * `expirationMonths` is nullable by design: null means no expiration. An
 * absent field is left undefined so it is not confused with an explicit null.
 */
function asExpirationMonths(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  return Number(value);
}

async function handleRequest(
  request: IncomingMessage,
  response: ServerResponse
): Promise<void> {
  const context = createRequestContext(getCorrelationHeader(request));
  const url = new URL(
    request.url ?? "/",
    `http://${request.headers.host ?? "localhost"}`
  );
  const pathname = url.pathname;

  response.setHeader("x-correlation-id", context.correlationId);
  response.setHeader("x-request-id", context.requestId);

  // API-CORS-1 — the one place browser origin policy is applied.
  //
  // It sits here, above the route table and above every call to
  // `resolveTrustedRequestIdentity`, for two reasons.
  //
  // First, a preflight must be answerable WITHOUT a bearer token. The browser
  // sends `OPTIONS` before it will send `Authorization` at all, so demanding
  // authentication for the preflight would make authenticated cross-origin
  // requests impossible by construction — which is exactly the bug this fixes.
  //
  // Second, the preflight must not execute application logic. It is answered
  // and returned immediately below, so no route body runs, no identity is
  // resolved, and no protected data can reach the response. `OPTIONS` never
  // reaches the route table.
  //
  // Applying the headers here also means they are present on error responses,
  // so a browser can read a 401 or a 403 as an error rather than as an opaque
  // network failure. That is a diagnosis improvement, not a permission: CORS
  // decides whether a page may READ a response, never whether the server
  // answers it. Authentication, authorization and RLS are untouched.
  const cors = resolveCors(
    {
      origin: readOriginHeader(request),
      method: request.method
    },
    config.allowedWebOrigins
  );

  for (const [header, value] of Object.entries(cors.headers)) {
    response.setHeader(header, value);
  }

  if (cors.isPreflight) {
    // 204 for an allowed origin; 403 for anything else. Neither carries a body,
    // and a disallowed origin received no Access-Control-Allow-Origin above, so
    // the browser blocks the real request either way.
    response.writeHead(cors.originAllowed ? 204 : 403);
    response.end();
    return;
  }

  try {
    if (request.method === "GET" && pathname === "/health") {
      sendJson(response, 200, getApiHealthDetails());
      return;
    }

    // CERT-005 — public certificate verification.
    //
    // Deliberately unauthenticated: an employer holding a reference must be
    // able to confirm a certificate without an account. The public capability
    // is exactly one exact opaque reference in, one curated result out. There
    // is no search, no listing, no prefix lookup and no user lookup, and the
    // payload carries no holder identity, no Evidence and no internal ids.
    const certificateVerifyMatch = pathname.match(
      /^\/certificates\/verify\/([^/]+)$/
    );
    if (request.method === "GET" && certificateVerifyMatch) {
      const result = await verifyCertificateByReference(
        decodeURIComponent(certificateVerifyMatch[1] ?? "")
      );

      if (result.outcome === "malformed_reference") {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "That verification reference is not in a valid format.",
          retryable: false
        });
      }

      if (result.outcome === "not_found") {
        throw new AppError({
          code: "NOT_FOUND",
          message: "We could not find a certificate for that reference.",
          retryable: false
        });
      }

      // A dependency or replay failure is never reported as invalid or
      // missing (CERT-005 section 12).
      if (result.outcome === "unavailable") {
        throw new AppError({
          code: "DEPENDENCY_UNAVAILABLE",
          message:
            "Verification is temporarily unavailable. This does not mean the certificate is invalid.",
          retryable: true
        });
      }

      sendJson(response, 200, { verification: result.certificate });
      return;
    }

    if (request.method === "GET" && pathname === "/ready") {
      sendJson(response, 200, {
        ready: true,
        service: "api",
        checkedAt: new Date().toISOString()
      });
      return;
    }

    if (request.method === "GET" && pathname === "/lab-sessions") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { sessions: await listLabSessions(trusted.accessToken) });
      return;
    }

    if (request.method === "POST" && pathname === "/lab-sessions") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, { session: await requestLabSession(trusted.accessToken, trusted.identity.userId, { labDefinitionStableId: String(body.labDefinitionStableId ?? ""), ...(body.labDefinitionVersion === undefined ? {} : { labDefinitionVersion: Number(body.labDefinitionVersion) }) }) });
      return;
    }

    const labSessionMatch = pathname.match(/^\/lab-sessions\/([^/]+)$/);
    if (request.method === "GET" && labSessionMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { session: await getLabSession(trusted.accessToken, decodeURIComponent(labSessionMatch[1] ?? "")) });
      return;
    }

    const labSessionStartMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/start$/);
    if (request.method === "POST" && labSessionStartMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { session: await startLabSession(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionStartMatch[1] ?? "")) });
      return;
    }

    const labSessionEndMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/end$/);
    if (request.method === "POST" && labSessionEndMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { session: await endLabSession(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionEndMatch[1] ?? "")) });
      return;
    }

    const labSessionAccessMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/access$/);
    if (request.method === "GET" && labSessionAccessMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { access: await getLabAccessDelivery(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionAccessMatch[1] ?? "")) });
      return;
    }

    const labSessionResetMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/reset$/);
    if (request.method === "POST" && labSessionResetMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { reset: await resetLabSession(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionResetMatch[1] ?? "")) });
      return;
    }

    const labSessionValidateMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/validate$/);
    if (request.method === "POST" && labSessionValidateMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { validation: await validateLabSession(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionValidateMatch[1] ?? "")) });
      return;
    }

    const labSessionValidationsMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/validations$/);
    if (request.method === "GET" && labSessionValidationsMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { validations: await listLabValidationRuns(trusted.accessToken, decodeURIComponent(labSessionValidationsMatch[1] ?? "")) });
      return;
    }

    const labSessionIsolationMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/isolation$/);
    if (request.method === "GET" && labSessionIsolationMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { isolation: await attestLabIsolation(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionIsolationMatch[1] ?? "")) });
      return;
    }

    const labSessionExpireMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/expire$/);
    if (request.method === "POST" && labSessionExpireMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { operation: await expireLabSession(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionExpireMatch[1] ?? "")) });
      return;
    }

    const labSessionCleanupMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/cleanup$/);
    if (request.method === "POST" && labSessionCleanupMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { operation: await cleanupLabSessionResources(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionCleanupMatch[1] ?? "")) });
      return;
    }

    const labSessionRecoverMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/recover$/);
    if (request.method === "POST" && labSessionRecoverMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { operation: await recoverLabSession(trusted.accessToken, trusted.identity.userId, decodeURIComponent(labSessionRecoverMatch[1] ?? "")) });
      return;
    }

    const labSessionOperationsMatch = pathname.match(/^\/lab-sessions\/([^/]+)\/operations$/);
    if (request.method === "GET" && labSessionOperationsMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { operations: await listLabOperations(trusted.accessToken, decodeURIComponent(labSessionOperationsMatch[1] ?? "")) });
      return;
    }

    if (request.method === "GET" && pathname === "/lab-providers") {
      await resolveTrustedRequestIdentity(request);
      await sendLabProviderCatalog(response);
      return;
    }

    if (request.method === "GET" && pathname === "/lab-providers/mock/capabilities") {
      await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { capabilities: await mockLabProvider.getCapabilities(), capacity: await mockLabProvider.getCapacity() });
      return;
    }

    if (request.method === "GET" && pathname === "/evidence") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { evidence: await listStudentEvidence(trusted.accessToken) });
      return;
    }

    if (request.method === "POST" && pathname === "/evidence/export") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, {
        export: await exportStudentEvidence(trusted.accessToken, trusted.identity.userId, {
          competencyStableId: url.searchParams.get("competencyStableId") ?? undefined,
          sourceType: url.searchParams.get("sourceType") ?? undefined,
          courseStableId: url.searchParams.get("courseStableId") ?? undefined,
          limit: url.searchParams.get("limit") ?? undefined
        })
      });
      return;
    }

    if (request.method === "GET" && pathname === "/evidence/portfolio") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, {
        portfolio: await getStudentEvidencePortfolio(trusted.accessToken, {
          competencyStableId: url.searchParams.get("competencyStableId") ?? undefined,
          sourceType: url.searchParams.get("sourceType") ?? undefined,
          courseStableId: url.searchParams.get("courseStableId") ?? undefined,
          limit: url.searchParams.get("limit") ?? undefined
        })
      });
      return;
    }

    // CERT-003 — the student's own issued certificates, and issuance.
    //
    // The subject is always trusted.identity.userId. There is deliberately no
    // userId parameter: the request body carries only which exact certificate
    // definition version to issue. Issuance is idempotent server-side, so a
    // retry after a lost response returns the same record rather than a
    // duplicate.
    // CERT-004 — the student's own certificates and their effective lifecycle
    // status. Read-only, scoped to the authenticated caller. There is no
    // lifecycle control here: CERT-008 owns revoke/correct/supersede/restore,
    // and CERT-005 owns any public verification.
    // CERT-006 — the learner's private certificate portfolio.
    //
    // Presentation only, scoped to the authenticated caller. It composes
    // CERT-001 definition detail, CERT-003 pinned competency provenance and
    // CERT-004 lifecycle status, and carries the owner's own verification
    // reference so they can open CERT-005 verification of their credential.
    // There is no admin access, no export execution and no lifecycle control.
    if (request.method === "GET" && pathname === "/certificates/portfolio") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, {
        portfolio: await getStudentCertificatePortfolio(
          trusted.identity.userId,
          normalizeCertificatePortfolioFilters({
            status: url.searchParams.get("status") ?? undefined,
            certificateDefinitionStableId:
              url.searchParams.get("certificateDefinitionStableId") ?? undefined
          })
        )
      });
      return;
    }

    // CERT-009 — the owner's branded certificate presentation.
    //
    // Presentation only, scoped to the authenticated caller. It composes
    // CERT-006's projection and adds CERT-001 presentation metadata plus the
    // owner's own current display name. The display name is presentation data,
    // never issuance truth, and never reaches CERT-005 or CERT-007.
    if (request.method === "GET" && pathname === "/certificates/presentation") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(
        response,
        200,
        await getStudentCertificatePresentation(
          trusted.identity.userId,
          normalizeCertificatePortfolioFilters({
            status: url.searchParams.get("status") ?? undefined,
            certificateDefinitionStableId:
              url.searchParams.get("certificateDefinitionStableId") ?? undefined
          })
        )
      );
      return;
    }

    if (request.method === "GET" && pathname === "/certificates") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, {
        certificates: await listStudentCertificateRecords(
          trusted.identity.userId
        )
      });
      return;
    }

    if (request.method === "POST" && pathname === "/certificates/issuance") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      const issuance = await issueStudentCertificate(trusted.identity.userId, {
        stableId: String(body.stableId ?? ""),
        version: Number(body.version)
      });
      sendJson(response, issuance.alreadyIssued ? 200 : 201, issuance);
      return;
    }

    // CERT-007 — the student's own certificate export.
    //
    // Composes the CERT-006 portfolio and returns a portable representation of
    // certificates the caller already owns, scoped to the authenticated caller
    // and reflecting current lifecycle status at the moment of export.
    //
    // It publishes nothing: no share link is minted here, no public route
    // exists, and no branded or printable artifact is produced — CERT-009 owns
    // presentation.
    if (request.method === "POST" && pathname === "/certificates/export") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, {
        export: await exportStudentCertificates(trusted.identity.userId, {
          filters: normalizeCertificatePortfolioFilters({
            status: url.searchParams.get("status") ?? undefined,
            certificateDefinitionStableId:
              url.searchParams.get("certificateDefinitionStableId") ?? undefined
          })
        })
      });
      return;
    }

    // CERT-002 — certificates a student may select for evaluation.
    //
    // Read-only discovery, narrow by design: published and not superseded, with
    // only the fields the selector needs. No eligibility is computed here, and
    // no administrative field is exposed.
    if (request.method === "GET" && pathname === "/certificates/definitions") {
      await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, {
        definitions: await listSelectableCertificateDefinitions()
      });
      return;
    }

    // CERT-002 — the student's own certificate eligibility.
    //
    // The subject is always trusted.identity.userId. There is deliberately no
    // userId query parameter and no request body, so a client cannot ask about
    // anyone else. This is the only student-facing certificate route: no
    // issuance, no certificate record, no verification.
    if (request.method === "GET" && pathname === "/certificates/eligibility") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, {
        eligibility: await getStudentCertificateEligibility(
          trusted.identity.userId,
          {
            stableId: url.searchParams.get("stableId") ?? "",
            version: Number(url.searchParams.get("version"))
          }
        )
      });
      return;
    }

    const evidenceCorrectionsMatch = pathname.match(/^\/evidence\/([^/]+)\/corrections$/);
    if (request.method === "GET" && evidenceCorrectionsMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, {
        corrections: await getStudentEvidenceCorrectionHistory(
          trusted.accessToken,
          decodeURIComponent(evidenceCorrectionsMatch[1] ?? "")
        )
      });
      return;
    }

    const adminEvidenceCorrectionsMatch = pathname.match(/^\/admin\/evidence\/([^/]+)\/corrections$/);
    if (request.method === "GET" && adminEvidenceCorrectionsMatch) {
      const trusted = await founder(request);
      sendJson(response, 200, {
        corrections: await getEvidenceCorrectionHistory(
          trusted.identity,
          decodeURIComponent(adminEvidenceCorrectionsMatch[1] ?? "")
        )
      });
      return;
    }

    if (request.method === "POST" && adminEvidenceCorrectionsMatch) {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        correction: await appendEvidenceCorrection(trusted.identity, {
          evidenceId: decodeURIComponent(adminEvidenceCorrectionsMatch[1] ?? ""),
          action: String(body.action ?? "") as Parameters<typeof appendEvidenceCorrection>[1]["action"],
          reason: String(body.reason ?? ""),
          expectedPreviousState: String(body.expectedPreviousState ?? "") as Parameters<typeof appendEvidenceCorrection>[1]["expectedPreviousState"],
          ...(body.supersedingEvidenceId ? { supersedingEvidenceId: String(body.supersedingEvidenceId) } : {}),
          ...(body.idempotencyKey ? { idempotencyKey: String(body.idempotencyKey) } : {})
        })
      });
      return;
    }

    const evidenceCompetencyMatch = pathname.match(/^\/evidence\/([^/]+)\/competencies$/);
    if (request.method === "GET" && evidenceCompetencyMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { competencies: await listEvidenceCompetencyLinks(trusted.accessToken, decodeURIComponent(evidenceCompetencyMatch[1] ?? "")) });
      return;
    }

    const competencyEvidenceMatch = pathname.match(/^\/competencies\/([^/]+)\/evidence$/);
    if (request.method === "GET" && competencyEvidenceMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { evidence: await listCompetencyEvidenceLinks(trusted.accessToken, decodeURIComponent(competencyEvidenceMatch[1] ?? "")) });
      return;
    }

    const evidenceRecordMatch = pathname.match(/^\/evidence\/([^/]+)$/);
    const evidenceRecordSegment = decodeURIComponent(evidenceRecordMatch?.[1] ?? "");
    if (
      request.method === "GET" &&
      evidenceRecordMatch &&
      !isReservedEvidencePathSegment(evidenceRecordSegment)
    ) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { evidence: await getCanonicalEvidenceForStudent(trusted.accessToken, evidenceRecordSegment) });
      return;
    }

    const noteExportMatch = pathname.match(/^\/notes\/([^/]+)\/export$/);

    if (request.method === "GET" && noteExportMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const noteId = decodeURIComponent(noteExportMatch[1] ?? "");
      const bundle = await buildStudentNoteExport(trusted.accessToken, noteId);
      const serialized = serializeStudentNoteExport(
        bundle,
        url.searchParams.get("format")
      );

      response.statusCode = 200;
      response.setHeader("content-type", serialized.contentType);
      response.setHeader(
        "content-disposition",
        `attachment; filename="note-${noteId}.${serialized.extension}"`
      );
      response.end(serialized.body);
      return;
    }

    if (request.method === "GET" && pathname === "/notes/search") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const tagIds = url.searchParams.getAll("tagId");
      const pinnedValue = url.searchParams.get("pinned");
      sendJson(response, 200, { results: await searchStudentNotes(trusted.accessToken, { query: url.searchParams.get("q") ?? "", tagIds, contextType: url.searchParams.get("contextType") ?? undefined, contextStableId: url.searchParams.get("contextStableId") ?? undefined, pinned: pinnedValue == null ? undefined : pinnedValue === "true", limit: Number(url.searchParams.get("limit") ?? 25) }) });
      return;
    }

    // SEARCH-002 — curriculum search. SEARCH-004 — filters and facets.
    //
    // Authenticated, caller-scoped. Curriculum remains authoritative: this
    // reads published curriculum through the caller's own RLS-scoped client and
    // projects it, holding no index of its own. `count` is the number of
    // authorized results actually returned, and each facet count is the number
    // of those returned results of one content type — there is deliberately no
    // global total, no candidate total and no hidden count, any of which would
    // become a result-count side channel.
    //
    // `contentType` may be repeated for multi-select, following the same
    // `getAll` convention `/notes/search` uses for `tagId`. Nothing else is
    // accepted: there is no free-form filter object and no arbitrary field.
    if (request.method === "GET" && pathname === "/search/curriculum") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(
        response,
        200,
        await searchCurriculum(trusted.accessToken, {
          query: url.searchParams.get("q") ?? "",
          limit: url.searchParams.get("limit") ?? undefined,
          contentTypes: url.searchParams.getAll("contentType")
        })
      );
      return;
    }

    if (request.method === "GET" && pathname === "/bookmarks") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { bookmarks: await listStudentBookmarks(trusted.accessToken) });
      return;
    }
    if (request.method === "POST" && pathname === "/bookmarks") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        bookmark: await createStudentBookmark(trusted.accessToken, {
          targetType: String(body.targetType) as import("@tlp/shared-types").BookmarkTargetType,
          targetStableId: String(body.targetStableId ?? ""),
          ...(body.targetVersion === undefined
            ? {}
            : { targetVersion: Number(body.targetVersion) }),
          ...(body.label === undefined
            ? {}
            : { label: String(body.label) })
        })
      });
      return;
    }
    const bookmarkMatch = pathname.match(/^\/bookmarks\/([^/]+)$/);
    if (request.method === "DELETE" && bookmarkMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      await deleteStudentBookmark(trusted.accessToken, decodeURIComponent(bookmarkMatch[1] ?? ""));
      sendJson(response, 200, { deleted: true });
      return;
    }

    if (request.method === "GET" && pathname === "/note-tags") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { tags: await listStudentTags(trusted.accessToken) });
      return;
    }

    if (request.method === "POST" && pathname === "/note-tags") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, { tag: await createStudentTag(trusted.accessToken, body.name) });
      return;
    }

    const noteTagMatch = pathname.match(/^\/note-tags\/([^/]+)$/);
    if (request.method === "PUT" && noteTagMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, { tag: await renameStudentTag(trusted.accessToken, decodeURIComponent(noteTagMatch[1] ?? ""), body.name) });
      return;
    }
    if (request.method === "DELETE" && noteTagMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      await deleteStudentTag(trusted.accessToken, decodeURIComponent(noteTagMatch[1] ?? ""));
      sendJson(response, 200, { deleted: true });
      return;
    }

    const noteBlocksMatch = pathname.match(/^\/notes\/([^/]+)\/blocks$/);
    if (request.method === "GET" && noteBlocksMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { blocks: await listNoteBlocks(trusted.accessToken, decodeURIComponent(noteBlocksMatch[1] ?? "")) });
      return;
    }
    if (request.method === "PUT" && noteBlocksMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, { blocks: await replaceNoteBlocks(trusted.accessToken, decodeURIComponent(noteBlocksMatch[1] ?? ""), Array.isArray(body.blocks) ? body.blocks : []) });
      return;
    }

    const noteTagsMatch = pathname.match(/^\/notes\/([^/]+)\/tags$/);
    if (request.method === "PUT" && noteTagsMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, { tagIds: await replaceNoteTags(trusted.accessToken, decodeURIComponent(noteTagsMatch[1] ?? ""), Array.isArray(body.tagIds) ? body.tagIds : []) });
      return;
    }

    const notePinnedMatch = pathname.match(/^\/notes\/([^/]+)\/pinned$/);
    if (request.method === "PUT" && notePinnedMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, { pinned: await setNotePinned(trusted.accessToken, decodeURIComponent(notePinnedMatch[1] ?? ""), Boolean(body.pinned)) });
      return;
    }

    if (request.method === "GET" && pathname === "/notes") { const trusted=await resolveTrustedRequestIdentity(request); sendJson(response,200,{notes:await listStudentNotes(trusted.accessToken)}); return; }
    if (request.method === "POST" && pathname === "/notes") { const trusted=await resolveTrustedRequestIdentity(request); const body=await readJsonBody(request); sendJson(response,201,{note:await createStudentNote(trusted.accessToken,body)}); return; }
    const noteMatch = pathname.match(/^\/notes\/([^/]+)$/);
    if (request.method === "GET" && noteMatch) { const trusted=await resolveTrustedRequestIdentity(request); sendJson(response,200,{note:await getStudentNote(trusted.accessToken,decodeURIComponent(noteMatch[1]??""))}); return; }
    if (request.method === "PUT" && noteMatch) { const trusted=await resolveTrustedRequestIdentity(request); const body=await readJsonBody(request); sendJson(response,200,{note:await updateStudentNote(trusted.accessToken,decodeURIComponent(noteMatch[1]??""),body)}); return; }
    if (request.method === "DELETE" && noteMatch) { const trusted=await resolveTrustedRequestIdentity(request); await deleteStudentNote(trusted.accessToken,decodeURIComponent(noteMatch[1]??"")); sendJson(response,200,{deleted:true}); return; }

    if (request.method === "GET" && pathname === "/auth/me") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { identity: trusted.identity, profile: trusted.profile });
      return;
    }

    const assessmentStartMatch = pathname.match(
      /^\/assessments\/([^/]+)\/attempts$/
    );

    if (request.method === "POST" && assessmentStartMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const stableId = decodeURIComponent(assessmentStartMatch[1] ?? "");

      sendJson(response, 201, {
        attempt: await startAssessmentAttempt(
          { userId: trusted.identity.userId },
          stableId
        )
      });
      return;
    }

    const assessmentInterruptMatch = pathname.match(new RegExp("^/assessment-attempts/([^/]+)/interrupt$"));

    if (request.method === "POST" && assessmentInterruptMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, { recovery: await interruptAssessmentAttempt({ userId: trusted.identity.userId }, decodeURIComponent(assessmentInterruptMatch[1] ?? ""), String(body.reason ?? "unknown")) });
      return;
    }

    const assessmentResumeMatch = pathname.match(new RegExp("^/assessment-attempts/([^/]+)/resume$"));

    if (request.method === "POST" && assessmentResumeMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, { recovery: await resumeInterruptedAssessmentAttempt({ userId: trusted.identity.userId }, decodeURIComponent(assessmentResumeMatch[1] ?? "")) });
      return;
    }

    const labSessionEvidenceMatch = pathname.match(new RegExp("^/lab-sessions/([^/]+)/evidence$"));

    if (request.method === "GET" && labSessionEvidenceMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const labSessionId = decodeURIComponent(labSessionEvidenceMatch[1] ?? "");
      const evidenceIds = await listLabSessionEvidenceIds(trusted.identity.userId, labSessionId);
      const evidence = [];

      for (const evidenceId of evidenceIds) {
        evidence.push({
          evidence: await getCanonicalEvidenceForStudent(trusted.accessToken, evidenceId),
          competencies: await listEvidenceCompetencyLinks(trusted.accessToken, evidenceId)
        });
      }

      sendJson(response, 200, { evidence });
      return;
    }

    const assessmentEvidenceMatch = pathname.match(new RegExp("^/assessment-attempts/([^/]+)/evidence$"));

    if (request.method === "GET" && assessmentEvidenceMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const attemptId = decodeURIComponent(assessmentEvidenceMatch[1] ?? "");
      const evidenceId = await getAssessmentAttemptEvidenceId(trusted.identity.userId, attemptId);

      sendJson(response, 200, {
        evidence: evidenceId ? await getCanonicalEvidenceForStudent(trusted.accessToken, evidenceId) : null,
        competencies: evidenceId ? await listEvidenceCompetencyLinks(trusted.accessToken, evidenceId) : []
      });
      return;
    }

    const readinessOutcomeMatch = pathname.match(
      new RegExp("^/assessment-attempts/([^/]+)/readiness-outcome$")
    );

    if (request.method === "GET" && readinessOutcomeMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);

      sendJson(response, 200, {
        outcome: await getReadinessAssessmentOutcome(
          { userId: trusted.identity.userId },
          decodeURIComponent(readinessOutcomeMatch[1] ?? "")
        )
      });
      return;
    }

    const attemptMatch = pathname.match(
      /^\/assessment-attempts\/([^/]+)$/
    );

    if (request.method === "GET" && attemptMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);

      sendJson(response, 200, {
        attempt: await getAssessmentAttempt(
          { userId: trusted.identity.userId },
          decodeURIComponent(attemptMatch[1] ?? "")
        )
      });
      return;
    }

    const answerMatch = pathname.match(
      /^\/assessment-attempts\/([^/]+)\/answers$/
    );

    if (request.method === "PUT" && answerMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const body = await readJsonBody(request);

      await saveAssessmentAnswer(
        { userId: trusted.identity.userId },
        decodeURIComponent(answerMatch[1] ?? ""),
        {
          questionStableId: String(body.questionStableId ?? ""),
          selectedOptionIds: Array.isArray(body.selectedOptionIds)
            ? body.selectedOptionIds.map((value) => String(value))
            : []
        }
      );

      sendJson(response, 200, { saved: true });
      return;
    }

    const submitMatch = pathname.match(
      /^\/assessment-attempts\/([^/]+)\/submit$/
    );

    if (request.method === "POST" && submitMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);

      sendJson(response, 200, {
        attempt: await submitAssessmentAttempt(
          { userId: trusted.identity.userId },
          decodeURIComponent(submitMatch[1] ?? "")
        )
      });
      return;
    }

    if (request.method === "GET" && pathname === "/assessments") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, {
        assessments: await listPublishedAssessments(trusted.accessToken)
      });
      return;
    }

    if (request.method === "GET" && pathname === "/curriculum/paths") {
      const trusted = await resolveTrustedRequestIdentity(request);
      sendJson(response, 200, {
        learningPaths: await listPublishedLearningPaths(trusted.accessToken)
      });
      return;
    }

    if (request.method === "GET" && pathname.startsWith("/curriculum/paths/")) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const stableId = decodeURIComponent(pathname.slice("/curriculum/paths/".length));
      sendJson(response, 200, await getPublishedLearningPathTree(trusted.accessToken, stableId));
      return;
    }

    if (request.method === "GET" && pathname === "/learning/next-action") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const pathStableId = url.searchParams.get("path") ?? "";

      sendJson(
        response,
        200,
        await getRecommendedNextAction(
          trusted.accessToken,
          pathStableId
        )
      );
      return;
    }

    if (request.method === "GET" && pathname === "/learning/history") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const requestedLimit = Number(url.searchParams.get("limit") ?? "100");

      sendJson(
        response,
        200,
        await listLearningHistory(
          trusted.accessToken,
          Number.isFinite(requestedLimit) ? requestedLimit : 100
        )
      );
      return;
    }

    if (request.method === "GET" && pathname === "/learning/review") {
      const trusted = await resolveTrustedRequestIdentity(request);

      sendJson(
        response,
        200,
        await listReviewState(trusted.accessToken)
      );
      return;
    }

    if (request.method === "GET" && pathname === "/learning/competencies") {
      const trusted = await resolveTrustedRequestIdentity(request);

      sendJson(
        response,
        200,
        await listStudentCompetencyState(trusted.accessToken)
      );
      return;
    }

    if (request.method === "GET" && pathname === "/learning/resume") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const pathStableId = url.searchParams.get("path") ?? "";
      sendJson(
        response,
        200,
        await getResumeTarget(trusted.accessToken, pathStableId)
      );
      return;
    }

    const missionAccessMatch = pathname.match(
      /^\/learning\/missions\/([^/]+)\/access$/
    );

    if (request.method === "GET" && missionAccessMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const missionStableId = decodeURIComponent(
        missionAccessMatch[1] ?? ""
      );

      sendJson(
        response,
        200,
        await evaluateMissionPrerequisites(
          trusted.accessToken,
          missionStableId
        )
      );
      return;
    }

    if (request.method === "GET" && pathname === "/learning/progress") {
      const trusted = await resolveTrustedRequestIdentity(request);
      const pathStableId = url.searchParams.get("path") ?? "";

      sendJson(
        response,
        200,
        await getLearningPathProgress(
          trusted.accessToken,
          pathStableId
        )
      );
      return;
    }

    const missionProgressMatch = pathname.match(
      /^\/learning\/missions\/([^/]+)\/(start|complete)$/
    );

    if (request.method === "POST" && missionProgressMatch) {
      const trusted = await resolveTrustedRequestIdentity(request);
      const missionStableId = decodeURIComponent(
        missionProgressMatch[1] ?? ""
      );
      const action = missionProgressMatch[2];

      if (action !== "start" && action !== "complete") {
        throw new AppError({
          code: "VALIDATION_ERROR",
          message: "Unsupported mission progress action",
          retryable: false
        });
      }

      sendJson(response, 200, {
        progress: await recordMissionProgressAction(
          trusted.accessToken,
          missionStableId,
          action
        )
      });
      return;
    }

    // ROAS-1 — Founder-guarded Lab Definition and validation-check authoring.
    //
    // The Lab Engine shipped `lab_definitions` and `lab_validation_checks` with a
    // publication state but no write path anywhere in the repository, so LAB-001
    // section 14's "Founder can define a lab" was not reachable through any
    // governed mechanism. These four routes are that mechanism and nothing more.
    //
    // Authoring is metadata only. No provider is imported, selected, provisioned,
    // started, reset or validated by any handler below.
    if (request.method === "POST" && pathname === "/admin/labs/definitions") {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        labDefinition: await createDraftLabDefinition(
          { actorUserId: trusted.identity.userId },
          body as unknown as CreateLabDefinitionInput
        )
      });
      return;
    }

    if (request.method === "POST" && pathname === "/admin/labs/validation-checks") {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        checks: await addLabValidationChecks(
          { actorUserId: trusted.identity.userId },
          {
            profileStableId: body.profileStableId,
            checks: body.checks
          }
        )
      });
      return;
    }

    const labDefinitionStateMatch = pathname.match(
      /^\/admin\/labs\/definitions\/([^/]+)\/([0-9]+)\/state$/
    );
    if (request.method === "POST" && labDefinitionStateMatch) {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, {
        labDefinition: await transitionLabDefinitionState(
          { actorUserId: trusted.identity.userId },
          decodeURIComponent(labDefinitionStateMatch[1] ?? ""),
          Number(labDefinitionStateMatch[2]),
          String(body.publicationState ?? "") as LabPublicationState
        )
      });
      return;
    }

    const labProfileStateMatch = pathname.match(
      /^\/admin\/labs\/validation-profiles\/([^/]+)\/state$/
    );
    if (request.method === "POST" && labProfileStateMatch) {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, {
        checks: await transitionLabValidationProfileState(
          { actorUserId: trusted.identity.userId },
          decodeURIComponent(labProfileStateMatch[1] ?? ""),
          String(body.publicationState ?? "") as LabPublicationState
        )
      });
      return;
    }

    if (request.method === "POST" && pathname === "/admin/curriculum/learning-paths") {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        learningPath: await createDraftLearningPath(
          { actorUserId: trusted.identity.userId },
          {
            stableId: String(body.stableId ?? ""),
            title: String(body.title ?? ""),
            description: body.description === undefined ? undefined : String(body.description),
            estimatedMinutes: body.estimatedMinutes === undefined ? undefined : Number(body.estimatedMinutes)
          }
        )
      });
      return;
    }

    if (request.method === "POST" && pathname === "/admin/curriculum/courses") {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        course: await createDraftCourse(
          { actorUserId: trusted.identity.userId },
          {
            learningPathId: String(body.learningPathId ?? ""),
            stableId: String(body.stableId ?? ""),
            title: String(body.title ?? ""),
            description: body.description === undefined ? undefined : String(body.description),
            position: Number(body.position),
            estimatedMinutes: body.estimatedMinutes === undefined ? undefined : Number(body.estimatedMinutes)
          }
        )
      });
      return;
    }

    if (request.method === "POST" && pathname === "/admin/curriculum/modules") {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        module: await createDraftModule(
          { actorUserId: trusted.identity.userId },
          {
            courseId: String(body.courseId ?? ""),
            stableId: String(body.stableId ?? ""),
            title: String(body.title ?? ""),
            description: body.description === undefined ? undefined : String(body.description),
            position: Number(body.position),
            estimatedMinutes: body.estimatedMinutes === undefined ? undefined : Number(body.estimatedMinutes)
          }
        )
      });
      return;
    }

    if (request.method === "POST" && pathname === "/admin/curriculum/missions") {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        mission: await createDraftMission(
          { actorUserId: trusted.identity.userId },
          {
            moduleId: String(body.moduleId ?? ""),
            stableId: String(body.stableId ?? ""),
            title: String(body.title ?? ""),
            description: body.description === undefined ? undefined : String(body.description),
            position: Number(body.position),
            estimatedMinutes: body.estimatedMinutes === undefined ? undefined : Number(body.estimatedMinutes)
          }
        )
      });
      return;
    }

    if (request.method === "POST" && pathname === "/admin/curriculum/competencies") {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        competency: await createDraftCompetency(
          { actorUserId: trusted.identity.userId },
          {
            stableId: String(body.stableId ?? ""),
            title: String(body.title ?? ""),
            description: body.description === undefined ? undefined : String(body.description)
          }
        )
      });
      return;
    }

    if (request.method === "POST" && pathname === "/admin/curriculum/competency-prerequisites") {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      await addCompetencyPrerequisite(
        { actorUserId: trusted.identity.userId },
        String(body.competencyId ?? ""),
        String(body.prerequisiteCompetencyId ?? "")
      );
      sendJson(response, 201, { created: true });
      return;
    }

    if (request.method === "POST" && pathname === "/admin/curriculum/mission-competencies") {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      // WP-B / DEC-055. `relationship` has no default and is not inferred from
      // `required`. An omitted or unapproved value is rejected by
      // `linkMissionCompetency` as a VALIDATION_ERROR, so a caller cannot
      // create an unclassified link through this route.
      await linkMissionCompetency(
        { actorUserId: trusted.identity.userId },
        String(body.missionId ?? ""),
        String(body.competencyId ?? ""),
        body.required === undefined ? true : Boolean(body.required),
        body.relationship as MissionCompetencyRelationship
      );
      sendJson(response, 201, { linked: true });
      return;
    }

    const edit = pathname.match(/^\/admin\/curriculum\/learning-paths\/([^/]+)$/);
    if (request.method === "PATCH" && edit) {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, {
        learningPath: await updateDraftLearningPath(
          { actorUserId: trusted.identity.userId },
          decodeURIComponent(edit[1] ?? ""),
          {
            title: body.title === undefined ? undefined : String(body.title),
            description: body.description === undefined ? undefined : body.description === null ? null : String(body.description),
            estimatedMinutes: body.estimatedMinutes === undefined ? undefined : body.estimatedMinutes === null ? null : Number(body.estimatedMinutes)
          }
        )
      });
      return;
    }

    // SEARCH-007 — Founder-facing Search freshness health.
    //
    // Founder-guarded and fail-closed. Returns AGGREGATE OPERATIONAL STATE ONLY:
    // counts per resolution outcome plus accessible status text. It never
    // returns a Search Document body, a private note, a record identity, a
    // hidden candidate total, a credential or any authorization detail — a
    // report naming records would leak exactly the record existence SEARCH-003
    // protects.
    //
    // Reconciliation reads through the caller's own token. There is no
    // service-role path, no persisted index, no worker and no schedule.
    if (request.method === "GET" && pathname === "/admin/search/freshness") {
      const trusted = await founder(request);
      const report = await runSearchFreshnessReconciliation(
        trusted.accessToken,
        {
          documents: await projectCurriculumFreshnessDocuments(
            trusted.accessToken,
            url.searchParams.get("limit") ?? undefined
          ),
          limit: url.searchParams.get("limit") ?? undefined
        }
      );
      sendJson(response, 200, {
        report,
        status: describeSearchFreshnessStatus(report)
      });
      return;
    }

    const validate = pathname.match(/^\/admin\/curriculum\/learning-paths\/([^/]+)\/validate$/);
    if (request.method === "POST" && validate) {
      await founder(request);
      sendJson(response, 200, await validateLearningPathForPublication(decodeURIComponent(validate[1] ?? "")));
      return;
    }

    const transition = pathname.match(/^\/admin\/curriculum\/learning-paths\/([^/]+)\/transition$/);
    if (request.method === "POST" && transition) {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, {
        learningPath: await transitionLearningPathState(
          { actorUserId: trusted.identity.userId },
          decodeURIComponent(transition[1] ?? ""),
          asPublicationState(body.to),
          body.reason === undefined ? undefined : String(body.reason)
        )
      });
      return;
    }

    // CERT-001 — privileged Certificate Definition authoring.
    //
    // Every route below resolves founder(request) first. There is deliberately
    // no student-facing certificate route in Batch 1: no eligibility check, no
    // issuance, no student certificate record and no verification endpoint.
    // Students reach published definitions through RLS only.
    if (request.method === "GET" && pathname === "/admin/certificates/definitions") {
      await founder(request);
      sendJson(response, 200, {
        definitions: await listCertificateDefinitions()
      });
      return;
    }

    if (request.method === "POST" && pathname === "/admin/certificates/definitions") {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 201, {
        definition: await createDraftCertificateDefinition(
          { actorUserId: trusted.identity.userId },
          {
            stableId: String(body.stableId ?? ""),
            title: String(body.title ?? ""),
            description: body.description === undefined ? undefined : String(body.description),
            issuer: String(body.issuer ?? ""),
            effectiveAt: String(body.effectiveAt ?? ""),
            expirationMonths: asExpirationMonths(body.expirationMonths),
            verificationPermitted: body.verificationPermitted === undefined ? undefined : Boolean(body.verificationPermitted),
            presentation: asPresentation(body.presentation),
            ...(body.requiredCompetencies === undefined ? {} : { requiredCompetencies: asCompetencyRequirements(body.requiredCompetencies) }),
            ...(body.evidencePolicies === undefined ? {} : { evidencePolicies: asEvidencePolicies(body.evidencePolicies) })
          }
        )
      });
      return;
    }

    const certificateDefinitionMatch = pathname.match(/^\/admin\/certificates\/definitions\/([^/]+)$/);
    if (request.method === "GET" && certificateDefinitionMatch) {
      await founder(request);
      sendJson(response, 200, {
        definition: await getCertificateDefinition(
          decodeURIComponent(certificateDefinitionMatch[1] ?? "")
        )
      });
      return;
    }

    if (request.method === "PATCH" && certificateDefinitionMatch) {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, {
        definition: await updateCertificateDefinition(
          { actorUserId: trusted.identity.userId },
          decodeURIComponent(certificateDefinitionMatch[1] ?? ""),
          {
            title: body.title === undefined ? undefined : String(body.title),
            description: body.description === undefined ? undefined : body.description === null ? null : String(body.description),
            issuer: body.issuer === undefined ? undefined : String(body.issuer),
            effectiveAt: body.effectiveAt === undefined ? undefined : String(body.effectiveAt),
            expirationMonths: asExpirationMonths(body.expirationMonths),
            verificationPermitted: body.verificationPermitted === undefined ? undefined : Boolean(body.verificationPermitted),
            presentation: body.presentation === undefined ? undefined : asPresentation(body.presentation)
          }
        )
      });
      return;
    }

    const certificateCompetenciesMatch = pathname.match(/^\/admin\/certificates\/definitions\/([^/]+)\/competencies$/);
    if (request.method === "PUT" && certificateCompetenciesMatch) {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, {
        definition: await setCertificateDefinitionCompetencies(
          { actorUserId: trusted.identity.userId },
          decodeURIComponent(certificateCompetenciesMatch[1] ?? ""),
          asCompetencyRequirements(body.requiredCompetencies)
        )
      });
      return;
    }

    const certificateEvidencePoliciesMatch = pathname.match(/^\/admin\/certificates\/definitions\/([^/]+)\/evidence-policies$/);
    if (request.method === "PUT" && certificateEvidencePoliciesMatch) {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, {
        definition: await setCertificateDefinitionEvidencePolicies(
          { actorUserId: trusted.identity.userId },
          decodeURIComponent(certificateEvidencePoliciesMatch[1] ?? ""),
          asEvidencePolicies(body.evidencePolicies)
        )
      });
      return;
    }

    const certificateValidateMatch = pathname.match(/^\/admin\/certificates\/definitions\/([^/]+)\/validate$/);
    if (request.method === "POST" && certificateValidateMatch) {
      await founder(request);
      sendJson(response, 200, await validateCertificateDefinitionForPublication(
        decodeURIComponent(certificateValidateMatch[1] ?? "")
      ));
      return;
    }

    const certificateTransitionMatch = pathname.match(/^\/admin\/certificates\/definitions\/([^/]+)\/transition$/);
    if (request.method === "POST" && certificateTransitionMatch) {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, {
        definition: await transitionCertificateDefinitionState(
          { actorUserId: trusted.identity.userId },
          decodeURIComponent(certificateTransitionMatch[1] ?? ""),
          asPublicationState(body.to),
          body.reason === undefined ? undefined : String(body.reason)
        )
      });
      return;
    }

    const certificateSupersedeMatch = pathname.match(/^\/admin\/certificates\/definitions\/([^/]+)\/supersede$/);
    if (request.method === "POST" && certificateSupersedeMatch) {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(response, 200, {
        definition: await supersedeCertificateDefinition(
          { actorUserId: trusted.identity.userId },
          decodeURIComponent(certificateSupersedeMatch[1] ?? ""),
          String(body.supersededByDefinitionId ?? "")
        )
      });
      return;
    }

    // CERT-008 — privileged certificate revocation and correction.
    //
    // Founder-administrator only. A reason is mandatory, the actor comes from
    // the verified admin identity and never from the body, and the lifecycle
    // transition itself is performed by CERT-004's machinery inside one
    // transaction. There is deliberately no student-facing revoke, correct,
    // supersede or restore route.
    const certificateCorrectionsMatch = pathname.match(
      /^\/admin\/certificates\/([^/]+)\/corrections$/
    );
    if (request.method === "POST" && certificateCorrectionsMatch) {
      const trusted = await founder(request);
      const body = await readJsonBody(request);
      sendJson(
        response,
        201,
        await applyCertificateCorrection(
          { actorUserId: trusted.identity.userId },
          {
            certificateId: decodeURIComponent(
              certificateCorrectionsMatch[1] ?? ""
            ),
            action: String(body.action ?? ""),
            reason: String(body.reason ?? ""),
            ...(body.replacementCertificateId
              ? {
                  replacementCertificateId: String(
                    body.replacementCertificateId
                  )
                }
              : {}),
            ...(body.effectiveAt
              ? { effectiveAt: String(body.effectiveAt) }
              : {}),
            ...(body.idempotencyKey
              ? { idempotencyKey: String(body.idempotencyKey) }
              : {})
          }
        )
      );
      return;
    }

    if (request.method === "GET" && certificateCorrectionsMatch) {
      await founder(request);
      sendJson(response, 200, {
        corrections: await listCertificateCorrections(
          decodeURIComponent(certificateCorrectionsMatch[1] ?? "")
        )
      });
      return;
    }

    if (request.method === "GET" && pathname === "/admin/ping") {
      const trusted = await founder(request);
      sendJson(response, 200, {
        authorized: true,
        role: trusted.identity.role,
        mfaVerified: trusted.identity.mfaVerified
      });
      return;
    }

    throw new AppError({
      code: "NOT_FOUND",
      message: "Route not found",
      retryable: false,
      correlationId: context.correlationId
    });
  } catch (error) {
    const normalized =
      error instanceof AppError
        ? new AppError({ ...error.toJSON(), correlationId: error.correlationId ?? context.correlationId })
        : new AppError({
            code: "INTERNAL_ERROR",
            message: "Unexpected server error",
            retryable: false,
            correlationId: context.correlationId
          });

    const statusCode = statusCodeForError(normalized);

    // DB-SERVICE-ROLE-1 — server-side observability for unexpected throws.
    //
    // Previously only `normalized.toJSON()` was logged, so a non-`AppError`
    // exception left no record of what actually threw: the malformed
    // `SUPABASE_URL` incident produced `INTERNAL_ERROR / "Unexpected server
    // error"` in the log and nothing else, and the cause had to be recovered by
    // reading library source.
    //
    // This is added to the **log only**. `normalized` is unchanged, so the
    // client still receives exactly the generic error it received before — no
    // stack, no library message, no internal detail. `describeUnexpectedError`
    // redacts credential-shaped substrings and truncates the stack.
    const unexpected =
      error instanceof AppError ? undefined : describeUnexpectedError(error);

    log(statusCode >= 500 ? "error" : "warn", "Request failed", {
      correlationId: context.correlationId,
      event: "http.request.failed",
      metadata: {
        requestId: context.requestId,
        method: request.method,
        pathname,
        statusCode,
        error: normalized.toJSON(),
        ...(unexpected ? { unexpected } : {})
      }
    });

    sendJson(response, statusCode, { error: normalized.toJSON() });
  } finally {
    log("info", "Request completed", {
      correlationId: context.correlationId,
      event: "http.request.completed",
      metadata: {
        requestId: context.requestId,
        method: request.method,
        pathname,
        durationMs: Date.now() - context.startedAt,
        statusCode: response.statusCode
      }
    });
  }
}

const server = createServer((request, response) => {
  void handleRequest(request, response);
});

server.listen(config.apiPort, "127.0.0.1");

function shutdown() {
  server.close();
}
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
