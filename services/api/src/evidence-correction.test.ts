import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapEvidenceCorrectionRow } from "./evidence-correction";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const service = read("./evidence-correction.ts");
const evidenceService = read("./evidence.ts");
const linkService = read("./evidence-competency.ts");
const server = read("./server.ts");
const migration = read(
  "../../../supabase/migrations/20260813000500_evidence_correction_history.sql"
);
const evidenceMigration = read(
  "../../../supabase/migrations/20260813000100_evidence_foundation.sql"
);

describe("correction row mapping", () => {
  it("G: preserves the actor and authority context", () => {
    const event = mapEvidenceCorrectionRow({
      id: "correction-1",
      evidence_id: "evidence-1",
      user_id: "owner-1",
      sequence_number: 1,
      action: "invalidate",
      reason: "Validation profile defect corrected by the platform team.",
      actor_id: "admin-1",
      actor_role: "founder_admin",
      previous_effective_state: "active",
      new_effective_state: "invalidated",
      superseding_evidence_id: null,
      idempotency_key: null,
      metadata: {},
      occurred_at: "2026-08-13T00:00:00.000Z"
    });

    expect(event.actorId).toBe("admin-1");
    expect(event.actorRole).toBe("founder_admin");
    expect(event.sequenceNumber).toBe(1);
    expect(event.previousEffectiveState).toBe("active");
  });

  it("fails closed on a non-canonical stored action", () => {
    expect(() =>
      mapEvidenceCorrectionRow({
        id: "correction-1",
        evidence_id: "evidence-1",
        user_id: "owner-1",
        sequence_number: 1,
        action: "delete",
        reason: "Validation profile defect corrected by the platform team.",
        actor_id: "admin-1",
        actor_role: "founder_admin",
        previous_effective_state: "active",
        new_effective_state: "invalidated",
        metadata: {},
        occurred_at: "2026-08-13T00:00:00.000Z"
      })
    ).toThrow();
  });
});

describe("privileged authority", () => {
  it("reuses the existing founder_admin authorization model", () => {
    expect(service).toContain("requireCorrectionAuthority");
    expect(service).toContain("EVIDENCE_CORRECTION_AUTHORITY");
    expect(service).toContain('code: "FORBIDDEN"');
    expect(migration).toContain("actor_role in ('founder_admin')");
    expect(migration).toContain("from public.user_profiles");
    // No second authorization model is introduced.
    expect(service).not.toContain("isAdmin");
    expect(service).not.toContain("adminToken");
  });

  it("H: students cannot create correction events", () => {
    expect(migration).toContain(
      "for select to authenticated"
    );
    expect(migration).not.toMatch(/for\s+(insert|update|delete|all)\s+to\s+authenticated/i);
    expect(service).toContain("createServerSupabaseClient()");
  });

  it("privileged HTTP routes use the existing founder guard", () => {
    expect(server).toContain("adminEvidenceCorrectionsMatch");
    expect(server).toContain("await founder(request)");
    expect(server).toContain("appendEvidenceCorrection(trusted.identity");
  });

  it("students have no correction mutation route", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(
        new RegExp(
          `request\\.method === "${method}"[\\s\\S]{0,80}evidenceCorrectionsMatch\\)`
        ).test(server)
      ).toBe(false);
    }
  });
});

describe("I/J: append-only history", () => {
  it("the database refuses updates and deletes", () => {
    expect(migration).toContain(
      "Evidence correction history is append-only and cannot be updated"
    );
    expect(migration).toContain(
      "Evidence correction history is append-only and cannot be deleted"
    );
    expect(migration).toContain("before update or delete on public.evidence_correction_events");
  });

  it("the service only ever inserts", () => {
    expect(service).toContain(".insert(");
    expect(service).not.toContain(".update(");
    expect(service).not.toContain(".delete(");
    expect(service).not.toContain(".upsert(");
  });
});

describe("K/L/M/N: supersession safety", () => {
  it("L/N: self and circular supersession are structurally impossible", () => {
    expect(migration).toContain("superseding_evidence_id <> evidence_id");
    expect(migration).toContain("Circular Evidence supersession is not permitted");
    expect(migration).toContain("with recursive chain");
  });

  it("K: supersede requires an existing replacement", () => {
    expect(migration).toContain(
      "action <> 'supersede' or superseding_evidence_id is not null"
    );
    expect(migration).toContain("Superseding Evidence Record % was not found");
    expect(service).toContain("loadEvidenceRecord(input.supersedingEvidenceId)");
  });

  it("M: ownership mismatch fails closed", () => {
    expect(service).toContain("replacement.userId !== record.userId");
    expect(migration).toContain(
      "Superseding Evidence must belong to the same student"
    );
    expect(migration).toContain(
      "Evidence correction owner must match the Evidence owner"
    );
    // Ownership is taken from the Evidence Record, never the caller.
    expect(service).toContain("user_id: record.userId");
  });

  it("superseded Evidence is never deleted", () => {
    expect(migration).not.toContain("delete from public.evidence_records");
    expect(migration).toContain("on delete restrict");
  });
});

describe("O/AC: idempotency and concurrency", () => {
  it("AC: concurrent corrections cannot both claim the same predecessor", () => {
    expect(migration).toContain("unique (evidence_id, sequence_number)");
    expect(service).toContain("sequence_number: history.length + 1");
    expect(service).toContain("expectedPreviousState");
    expect(service).toContain("Evidence effective state changed since it was read");
    expect(service).toContain(
      "A concurrent Evidence correction was recorded first"
    );
  });

  it("O: a retried request with a stable key is collapsed, not duplicated", () => {
    expect(migration).toContain("unique (evidence_id, idempotency_key)");
    expect(service).toContain("findByIdempotencyKey");
    // Timestamps are never the logical identity.
    expect(service).not.toContain("idempotency_key: occurred_at");
  });
});

describe("P/Q/R/S: original truth is never rewritten", () => {
  it("P/Q: the Evidence Record and its digests are untouched", () => {
    expect(service).not.toMatch(
      /from\("evidence_records"\)[\s\S]{0,120}\.(update|upsert|insert|delete)\(/
    );
    expect(service).not.toContain("evidence_integrity_digest:");
    expect(service).not.toContain("source_integrity_digest:");
    expect(migration).not.toContain("alter table public.evidence_records");
    // Batch 1 provenance immutability is preserved, not weakened.
    expect(evidenceMigration).toContain(
      "Canonical Evidence provenance is immutable"
    );
    expect(migration).not.toContain("guard_evidence_record_provenance");
  });

  it("R/S: source engine tables are never touched", () => {
    for (const table of [
      "assessment_attempts",
      "assessment_evidence_handoffs",
      "lab_validation_runs",
      "lab_validation_results",
      "lab_evidence_handoffs"
    ]) {
      expect(service).not.toContain(table);
      expect(migration).not.toContain(table);
    }
  });
});

describe("T/U/V/Y: downstream consumers read effective state", () => {
  it("the qualifying accessor resolves effective state at read time", () => {
    expect(linkService).toContain("loadCorrectionEventsByEvidence");
    expect(linkService).toContain("resolveEffectiveEvidenceState");
    expect(linkService).toContain("isEffectivelyTrustedEvidence");
    expect(linkService).toContain("evidenceEffectiveState: effective.state");
    expect(linkService).toContain(
      "trusted && qualifiesAsDemonstrationEvidence(evidenceOutcome)"
    );
  });

  it("qualification is never cached onto the link", () => {
    expect(linkService).not.toContain("qualifies_for_demonstration");
    expect(linkService).not.toContain("qualifyingCached");
  });

  it("Y: the full accessor still returns corrected Evidence", () => {
    // The old unconditional skip of ineligible Evidence is gone, so invalidated
    // and superseded Evidence remains visible with its effective state.
    expect(linkService).not.toContain(
      "if (!evaluateEvidenceLinkEligibility(evidence).eligible) {"
    );
    expect(linkService).toContain(
      "export async function getAuthoritativeCompetencyEvidenceReferences"
    );
    expect(linkService).toContain(
      "export async function getQualifyingCompetencyEvidenceReferences"
    );
  });

  it("student Evidence reads expose effective state", () => {
    expect(evidenceService).toContain("withEffectiveEvidenceState");
    expect(evidenceService).toContain("loadCorrectionEventsByEvidence");
    expect(evidenceService).toContain("StudentEvidenceRecordWithState");
  });
});

describe("Z/AA/AB: transparency, scoping and AI boundary", () => {
  it("Z: students read their own history through the user-scoped client", () => {
    expect(service).toContain(
      "export async function getStudentEvidenceCorrectionHistory"
    );
    expect(service).toContain("createUserScopedSupabaseClient(accessToken)");
    expect(service).toContain("toStudentCorrectionEntry");
  });

  it("AA: RLS scopes correction history to the owner", () => {
    expect(migration).toContain("auth.uid() = user_id");
    expect(server).toContain("getStudentEvidenceCorrectionHistory(");
    expect(server).toContain("trusted.accessToken");
  });

  it("AB: no AI participates in correction authority", () => {
    expect(service).not.toMatch(/openai|anthropic|ollama|ai[-_ ]?gateway/i);
    expect(migration).not.toMatch(/openai|anthropic|ollama/i);
  });

  it("audits every correction with bounded identifiers only", () => {
    expect(service).toContain("evidence.review.");
    const auditBlocks = service.match(/writeAuditEvent\({[\s\S]*?\}\);/g) ?? [];
    expect(auditBlocks.length).toBeGreaterThan(0);
    for (const block of auditBlocks) {
      expect(block).not.toContain("metadata: record.metadata");
      expect(block).not.toContain("metadata: event.metadata");
      expect(block).not.toContain("reason:");
    }
  });

  it("does not touch competency or certificate state", () => {
    expect(service).not.toContain("student_competency_state");
    expect(service).not.toContain("recordAuthoritativeCompetencyEvidence");
    expect(service).not.toContain("certificate");
    expect(migration).not.toContain("certificate");
  });
});
