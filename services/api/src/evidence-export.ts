import { randomBytes } from "node:crypto";
import {
  AppError,
  assembleEvidenceExport,
  isVerificationId,
  type EvidenceExport,
  type EvidencePortfolioItem,
  type UnexportableEvidenceItem
} from "@tlp/shared-types";
import { writeAuditEvent } from "./audit";
import { getStudentEvidencePortfolio } from "./evidence-portfolio";
import {
  createServerSupabaseClient,
  createUserScopedSupabaseClient
} from "./supabase";

/**
 * Wave 7 / Batch 7 — EVID-008 Evidence Export and Verification Hooks.
 *
 * Produces a privacy-safe export of Evidence the student already owns, and
 * mints the stable verification reference that lets future Certificate Engine
 * verification arrive without an Evidence schema redesign.
 *
 * The export is composed on demand from the Batch 6 portfolio projection, so it
 * always reflects current effective state: Evidence invalidated or superseded
 * after an earlier export can never read as currently valid.
 *
 * This module writes exactly one thing — the verification reference — and
 * touches no canonical Evidence, no correction history and no source-engine
 * truth. There is no AI anywhere in this path.
 */

const VERIFICATION_TABLE = "evidence_verification_references";

const dependency = (message: string) =>
  new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message,
    retryable: true
  });

/**
 * Mints an opaque verification identifier.
 *
 * 24 random bytes from a cryptographic source, hex encoded behind a version
 * prefix. It is derived from nothing: no evidence id, no user id, no sequence,
 * no provider identifier, so it can never leak one.
 */
export function mintVerificationId(): string {
  return `ev1_${randomBytes(24).toString("hex")}`;
}

async function loadVerificationReferences(
  accessToken: string,
  evidenceIds: readonly string[]
): Promise<Map<string, string>> {
  const byEvidence = new Map<string, string>();
  if (evidenceIds.length === 0) {
    return byEvidence;
  }

  const supabase = createUserScopedSupabaseClient(accessToken);

  const { data, error } = await supabase
    .from(VERIFICATION_TABLE)
    .select("evidence_id,verification_id")
    .in("evidence_id", [...evidenceIds]);

  if (error) {
    throw dependency("Unable to load Evidence verification references");
  }

  for (const row of (data ?? []) as unknown as Array<Record<string, unknown>>) {
    byEvidence.set(String(row.evidence_id), String(row.verification_id));
  }

  return byEvidence;
}

/**
 * Ensures every Evidence Record in the set has a verification reference.
 *
 * Idempotent on the Evidence Record itself, which is the logical identity: a
 * repeated export request returns the identifier that already exists rather
 * than minting a second one, so an identifier a student exported earlier keeps
 * resolving. Timestamps are never part of that identity.
 *
 * A lost insert race is resolved by re-reading, so concurrent export requests
 * converge on one identifier per Evidence Record.
 */
async function ensureVerificationReferences(
  accessToken: string,
  userId: string,
  evidenceIds: readonly string[]
): Promise<Map<string, string>> {
  const existing = await loadVerificationReferences(accessToken, evidenceIds);
  const missing = evidenceIds.filter((id) => !existing.has(id));

  if (missing.length === 0) {
    return existing;
  }

  const supabase = createServerSupabaseClient();
  const rows: Array<Record<string, unknown>> = missing.map((evidenceId) => ({
    evidence_id: evidenceId,
    user_id: userId,
    verification_id: mintVerificationId()
  }));

  const { error } = await supabase
    .from(VERIFICATION_TABLE)
    .upsert(rows, { onConflict: "evidence_id", ignoreDuplicates: true });

  if (error) {
    throw dependency("Unable to mint Evidence verification references");
  }

  // Read back so a concurrent writer's identifier, not ours, becomes canonical.
  return loadVerificationReferences(accessToken, evidenceIds);
}

/**
 * Builds a privacy-safe export of the student's own Evidence.
 *
 * Ownership is enforced throughout by RLS on the underlying portfolio
 * accessors, so a caller can only ever export Evidence they own and a guessed
 * identifier surfaces nothing.
 *
 * Failure behaviour follows EVID-008 §12: if verification references cannot be
 * minted or read, the export is still returned with the affected items listed
 * as unavailable, and no Evidence state is altered or claimed invalid.
 */
export async function exportStudentEvidence(
  accessToken: string,
  trustedUserId: string,
  rawFilters: Record<string, unknown> | undefined
): Promise<EvidenceExport> {
  if (typeof trustedUserId !== "string" || trustedUserId.trim() === "") {
    throw new AppError({
      code: "UNAUTHORIZED",
      message: "An authenticated student is required to export evidence",
      retryable: false
    });
  }

  // The portfolio accessor normalizes untrusted query input itself, so raw
  // filter values are passed straight through rather than pre-shaped here.
  const portfolio = await getStudentEvidencePortfolio(accessToken, rawFilters);

  const unavailableItems: UnexportableEvidenceItem[] = portfolio.unavailableItems.map(
    (entry) => ({ reason: entry.reason })
  );

  const evidenceIds = portfolio.items.map((item) => item.evidenceId);

  let references = new Map<string, string>();
  if (evidenceIds.length > 0) {
    try {
      references = await ensureVerificationReferences(
        accessToken,
        trustedUserId,
        evidenceIds
      );
    } catch {
      // Verification infrastructure is unavailable. Report it; never claim the
      // Evidence is invalid and never alter local Evidence state.
      unavailableItems.push({
        reason:
          "Verification references are temporarily unavailable. Your evidence is unchanged; please try exporting again later."
      });
    }
  }

  const exportable: Array<{ item: EvidencePortfolioItem; verificationId: string }> =
    [];

  for (const item of portfolio.items) {
    const verificationId = references.get(item.evidenceId);
    if (!verificationId || !isVerificationId(verificationId)) {
      unavailableItems.push({
        reason: `An evidence item could not be given a verification reference and was omitted (${item.sourceLabel}).`
      });
      continue;
    }
    exportable.push({ item, verificationId });
  }

  const evidenceExport = assembleEvidenceExport({
    items: exportable,
    generatedAt: new Date().toISOString(),
    unavailableItems
  });

  writeAuditEvent({
    eventType: "evidence.export.requested",
    outcome: "success",
    actorId: trustedUserId,
    targetType: "evidence_export",
    metadata: {
      exportedItemCount: evidenceExport.totalCount,
      currentlyValidCount: evidenceExport.currentlyValidCount,
      unavailableItemCount: evidenceExport.unavailableItems.length
    }
  });

  return evidenceExport;
}
