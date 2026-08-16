import type { EvidenceRecordState, EvidenceSourceType } from "./evidence";
import type { EvidenceOutcome } from "./evidence-competency";
import type { EvidencePortfolioItem } from "./evidence-portfolio";
import { competencyReferenceKey } from "./evidence-portfolio";

/**
 * Wave 7 / Batch 7 — EVID-008 Evidence Export and Verification Hooks.
 *
 * Prepares Evidence for student-controlled portability and future verification
 * without exposing platform internals and without making anything public.
 *
 * Two distinct things live here:
 *
 *   the EXPORT REPRESENTATION — a privacy-safe projection of Evidence the
 *   student already owns, reflecting current effective state at read time;
 *
 *   the VERIFICATION PAYLOAD DESIGN — the minimal shape a future verifier would
 *   receive (EVID-008 §8). Designing it now is what lets Certificate Engine
 *   verification arrive without an Evidence schema redesign. No endpoint
 *   resolves it in this batch.
 *
 * Pure module: no I/O, no randomness, no AI.
 */

export const EVIDENCE_EXPORT_FORMAT_VERSION = "evidence-export-v1";
export const EVIDENCE_VERIFICATION_PAYLOAD_VERSION = "evidence-verification-v1";

/**
 * Opaque verification identifier. Cryptographically random, minted
 * server-side, and carrying no evidence id, user id, sequential value or
 * provider identifier.
 */
export const VERIFICATION_ID_PATTERN = /^ev1_[a-f0-9]{48}$/;

export function isVerificationId(value: unknown): boolean {
  return typeof value === "string" && VERIFICATION_ID_PATTERN.test(value);
}

/**
 * How a verifier should read the Evidence right now.
 *
 * Derived from the canonical effective state, never stored: an export produced
 * while Evidence was current must not keep claiming currency after the Evidence
 * is invalidated or superseded.
 */
export type EvidenceVerificationStatus =
  | "current"
  | "revoked"
  | "superseded"
  | "unavailable";

export function deriveVerificationStatus(
  effectiveState: EvidenceRecordState
): EvidenceVerificationStatus {
  switch (effectiveState) {
    case "active":
      return "current";
    case "invalidated":
      return "revoked";
    case "superseded":
      return "superseded";
    default:
      // Fail closed: an unrecognised state is never reported as current.
      return "unavailable";
  }
}

/** Readable wording. EVID-008 §10 forbids visual-only status. */
export function describeVerificationStatus(
  status: EvidenceVerificationStatus
): string {
  switch (status) {
    case "current":
      return "Currently valid evidence";
    case "revoked":
      return "Revoked — this evidence is no longer valid";
    case "superseded":
      return "Superseded — replaced by newer evidence";
    default:
      return "Verification status unavailable";
  }
}

/** Exact approved competency reference, never resolved against "latest". */
export interface ExportedCompetencyReference {
  competencyStableId: string;
  competencyVersion: number;
  competencyTitle?: string;
  relationship: string;
  courseStableId?: string;
  courseTitle?: string;
}

/**
 * One exported Evidence entry.
 *
 * Deliberately excludes: evidence integrity digests, source integrity digests,
 * provider and session identifiers, user identifiers, actor information,
 * correction event mechanics, private notes and audit data. The verification
 * identifier is the only reference hook, and it is opaque.
 */
export interface ExportedEvidenceItem {
  verificationId: string;
  sourceType: EvidenceSourceType;
  sourceLabel: string;
  outcomeLabel?: string;
  /** When the source engine observed the result. */
  observedAt: string;
  /** When the Evidence Engine accepted it. */
  issuedAt: string;
  verificationStatus: EvidenceVerificationStatus;
  verificationStatusLabel: string;
  evidenceOutcome: EvidenceOutcome;
  /** True only when this currently counts as proof of demonstration. */
  currentlyDemonstrates: boolean;
  competencies: ExportedCompetencyReference[];
}

/**
 * An Evidence entry that could not be exported. Identified, never fabricated
 * and never silently dropped (EVID-008 §12).
 */
export interface UnexportableEvidenceItem {
  reason: string;
}

export interface EvidenceExport {
  formatVersion: string;
  generatedAt: string;
  /** Plain-language description of what the export contains and omits. */
  contents: string[];
  items: ExportedEvidenceItem[];
  unavailableItems: UnexportableEvidenceItem[];
  totalCount: number;
  currentlyValidCount: number;
}

/**
 * The minimal payload a future verifier would receive for one identifier
 * (EVID-008 §8). Designed now, resolved by nothing in this batch.
 *
 * It answers exactly the five questions the specification lists and carries no
 * student identity at all, so publishing it later remains a policy decision
 * rather than a schema change.
 */
export interface EvidenceVerificationPayload {
  payloadVersion: string;
  verificationId: string;
  status: EvidenceVerificationStatus;
  statusLabel: string;
  sourceType: EvidenceSourceType;
  observedAt: string;
  issuedAt: string;
  competencies: Array<{
    competencyStableId: string;
    competencyVersion: number;
    competencyTitle?: string;
  }>;
}

function exportCompetencies(
  item: EvidencePortfolioItem
): ExportedCompetencyReference[] {
  const contextByKey = new Map(
    item.curriculum.map((context) => [competencyReferenceKey(context), context])
  );

  return item.competencies.map((link) => {
    // Matched on the exact pinned version, never the stable id alone.
    const context = contextByKey.get(competencyReferenceKey(link));

    return {
      competencyStableId: link.competencyStableId,
      competencyVersion: link.competencyVersion,
      ...(link.competencyTitle ? { competencyTitle: link.competencyTitle } : {}),
      relationship: link.relationship,
      ...(context?.courseStableId
        ? { courseStableId: context.courseStableId }
        : {}),
      ...(context?.courseTitle ? { courseTitle: context.courseTitle } : {})
    };
  });
}

/**
 * Projects one portfolio item into its export representation.
 *
 * Reuses the Batch 6 student-safe projection rather than re-reading Evidence,
 * so the export can never expose a field the portfolio deliberately withholds.
 */
export function toExportedEvidenceItem(
  item: EvidencePortfolioItem,
  verificationId: string
): ExportedEvidenceItem {
  const status = deriveVerificationStatus(item.effectiveState);

  return {
    verificationId,
    sourceType: item.sourceType,
    sourceLabel: item.sourceLabel,
    ...(item.outcomeLabel ? { outcomeLabel: item.outcomeLabel } : {}),
    observedAt: item.occurredAt,
    issuedAt: item.recordedAt,
    verificationStatus: status,
    verificationStatusLabel: describeVerificationStatus(status),
    evidenceOutcome: item.evidenceOutcome,
    // Reuses the canonical Batch 3/4/5 rule already applied by the portfolio.
    currentlyDemonstrates: item.isCurrentProof,
    competencies: exportCompetencies(item)
  };
}

/** Builds the verification payload a future verifier would receive. */
export function toVerificationPayload(
  item: ExportedEvidenceItem
): EvidenceVerificationPayload {
  return {
    payloadVersion: EVIDENCE_VERIFICATION_PAYLOAD_VERSION,
    verificationId: item.verificationId,
    status: item.verificationStatus,
    statusLabel: item.verificationStatusLabel,
    sourceType: item.sourceType,
    observedAt: item.observedAt,
    issuedAt: item.issuedAt,
    competencies: item.competencies.map((reference) => ({
      competencyStableId: reference.competencyStableId,
      competencyVersion: reference.competencyVersion,
      ...(reference.competencyTitle
        ? { competencyTitle: reference.competencyTitle }
        : {})
    }))
  };
}

/** Plain-language summary so the student understands what is included. */
export function describeExportContents(): string[] {
  return [
    "A verification reference for each item, which does not identify you.",
    "What the evidence was: an assessment or a hands-on lab, and its result.",
    "When it was completed and when the platform recorded it.",
    "Which competencies it supports, including the exact competency version.",
    "Whether each item is currently valid, revoked or superseded.",
    "It does not include your name, account details, lab infrastructure details, or platform internals."
  ];
}

export interface AssembleEvidenceExportInput {
  items: ReadonlyArray<{
    item: EvidencePortfolioItem;
    verificationId: string;
  }>;
  generatedAt: string;
  unavailableItems?: readonly UnexportableEvidenceItem[];
}

/** Assembles the export. Pure: the caller supplies identifiers and the clock. */
export function assembleEvidenceExport(
  input: AssembleEvidenceExportInput
): EvidenceExport {
  const items = input.items.map((entry) =>
    toExportedEvidenceItem(entry.item, entry.verificationId)
  );

  return {
    formatVersion: EVIDENCE_EXPORT_FORMAT_VERSION,
    generatedAt: input.generatedAt,
    contents: describeExportContents(),
    items,
    unavailableItems: [...(input.unavailableItems ?? [])],
    totalCount: items.length,
    currentlyValidCount: items.filter(
      (item) => item.verificationStatus === "current"
    ).length
  };
}
