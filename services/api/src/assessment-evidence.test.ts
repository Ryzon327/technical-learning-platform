import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const consumer = read("./assessment-evidence.ts");
const attempts = read("./assessment-attempts.ts");
const linkService = read("./evidence-competency.ts");
const server = read("./server.ts");
const migration = read(
  "../../../supabase/migrations/20260813000300_assessment_evidence_consumption.sql"
);
const handoffMigration = read(
  "../../../supabase/migrations/20260812000400_assessment_recovery_integrity.sql"
);

describe("assessment evidence pipeline", () => {
  it("A/B: consumption creates canonical Evidence and competency links", () => {
    expect(consumer).toContain("createCanonicalEvidence(");
    expect(consumer).toContain("linkEvidenceToCompetency(");
    expect(consumer).toContain('sourceType: "assessment_attempt"');
    expect(consumer).toContain('sourceEngine: "assessment"');
    expect(consumer).toContain('linkSource: "source_engine_mapping"');
  });

  it("I: the assessment result digest is preserved as the source integrity digest", () => {
    expect(consumer).toContain("sourceIntegrityDigest: facts.resultDigest");
    expect(consumer).toContain("result_digest");
    // Evidence never recomputes the upstream result.
    expect(consumer).not.toContain("calculateAssessmentResultDigest");
    expect(consumer).not.toContain("scoreAssessment");
  });

  it("J: exact approved competency versions come from the mapping table", () => {
    expect(consumer).toContain("assessment_competency_mappings");
    expect(consumer).toContain("competency_stable_id,competency_version,required");
    expect(consumer).toContain(
      "competencyVersion: mapping.competencyVersion"
    );
    // The handoff's stable-id-only array is never used as a version source.
    expect(consumer).not.toContain("competency_stable_ids");
  });

  it("D/E/F: ineligible attempts are skipped rather than recorded as evidence", () => {
    expect(consumer).toContain("evaluateAssessmentEvidenceEligibility");
    const skipSection = consumer.slice(
      consumer.indexOf("if (!eligibility.eligible)"),
      consumer.indexOf("const metadata = buildAssessmentEvidenceMetadata")
    );
    expect(skipSection).toContain('state: "skipped"');
    expect(skipSection).not.toContain("createCanonicalEvidence");
    expect(skipSection).not.toContain("linkEvidenceToCompetency");
  });

  it("enforces trusted ownership from the persisted handoff", () => {
    expect(consumer).toContain("facts.userId !== trustedUserId");
    expect(consumer).toContain('code: "FORBIDDEN"');
    expect(consumer).toContain("createServerSupabaseClient()");
  });

  it("K: no answer keys, questions or options reach Evidence metadata", () => {
    expect(consumer).toContain("validateAssessmentEvidenceMetadata");
    for (const forbidden of [
      "selected_option_ids",
      "correct_option_ids",
      "assessment_attempt_answers",
      "assessment_questions"
    ]) {
      expect(consumer).not.toContain(forbidden);
    }
  });

  it("holds no AI in the assessment evidence path", () => {
    expect(consumer).not.toMatch(/openai|anthropic|ollama|ai[-_ ]?gateway/i);
    expect(migration).not.toMatch(/openai|anthropic|ollama/i);
  });
});

describe("G: submission authority is never subordinate to evidence ingestion", () => {
  it("consumes only after the result and handoff are persisted", () => {
    const submitSection = attempts.slice(
      attempts.indexOf("export async function submitAssessmentAttempt")
    );
    const handoffIndex = submitSection.indexOf("buildAssessmentEvidenceHandoff");
    const consumeIndex = submitSection.indexOf(
      "tryConsumeAssessmentEvidenceHandoff"
    );
    expect(handoffIndex).toBeGreaterThan(-1);
    expect(consumeIndex).toBeGreaterThan(handoffIndex);
  });

  it("uses the non-throwing wrapper on the submission path", () => {
    expect(attempts).toContain("tryConsumeAssessmentEvidenceHandoff");
    expect(attempts).not.toContain("consumeAssessmentEvidenceHandoff(");
  });

  it("records and audits a consumption failure instead of propagating it", () => {
    const wrapperStart = consumer.indexOf(
      "export async function tryConsumeAssessmentEvidenceHandoff"
    );
    const wrapper = consumer.slice(
      wrapperStart,
      consumer.indexOf("export async function", wrapperStart + 1)
    );
    expect(wrapper).toContain("catch (error)");
    expect(wrapper).toContain("assessment.evidence.consumption_failed");
    expect(wrapper).toContain('state: "failed"');
    expect(wrapper).not.toContain("throw");
  });

  it("never deletes or rewrites the authoritative handoff", () => {
    expect(consumer).not.toContain(".delete(");
    expect(consumer).not.toMatch(
      /from\("assessment_evidence_handoffs"\)[\s\S]{0,80}\.(update|upsert|insert|delete)\(/
    );
    expect(consumer).not.toMatch(
      /from\("assessment_attempts"\)[\s\S]{0,80}\.(update|upsert|insert|delete)\(/
    );
  });

  it("leaves the Wave 4 handoff table unchanged", () => {
    expect(handoffMigration).toContain(
      "create table if not exists public.assessment_evidence_handoffs"
    );
    expect(migration).not.toContain("alter table public.assessment_evidence_handoffs");
    expect(migration).not.toContain("drop table");
  });
});

describe("H: retry is durable and idempotent", () => {
  it("persists consumption state for later retry", () => {
    expect(migration).toContain(
      "create table if not exists public.assessment_evidence_consumptions"
    );
    expect(migration).toContain("state in ('consumed', 'skipped', 'failed')");
    expect(consumer).toContain("recordConsumptionState");
    expect(consumer).toContain(
      "export async function retryFailedAssessmentEvidenceConsumption"
    );
  });

  it("relies on Batch 1 and Batch 2 idempotency rather than its own dedupe", () => {
    // The consumer performs no existence check of its own: repeated calls are
    // safe because the canonical source identity and link identity are unique.
    expect(consumer).not.toContain("select(\"id\").eq(\"source_reference\"");
    expect(consumer).toContain("createCanonicalEvidence(");
  });

  it("keeps consumption bookkeeping from becoming a second failure mode", () => {
    const bookkeeping = consumer.slice(
      consumer.indexOf("async function recordConsumptionState"),
      consumer.indexOf("async function loadAssessmentEvidenceFacts")
    );
    expect(bookkeeping).toContain("catch");
    expect(bookkeeping).not.toContain("throw");
  });

  it("stores internal consumption state with no student-facing policy", () => {
    expect(migration).toContain(
      "alter table public.assessment_evidence_consumptions enable row level security"
    );
    expect(migration).not.toMatch(
      /create policy[\s\S]{0,200}assessment_evidence_consumptions/
    );
  });
});

describe("C: failed assessment evidence cannot advance mastery", () => {
  it("reports the authoritative outcome on every learning engine reference", () => {
    expect(linkService).toContain("deriveEvidenceOutcome");
    expect(linkService).toContain("qualifiesForDemonstration");
    expect(linkService).toContain("evidenceOutcome");
  });

  it("exposes a mastery-safe accessor that excludes non-positive evidence", () => {
    expect(linkService).toContain(
      "export async function getQualifyingCompetencyEvidenceReferences"
    );
    const accessor = linkService.slice(
      linkService.indexOf(
        "export async function getQualifyingCompetencyEvidenceReferences"
      )
    );
    expect(accessor).toContain("reference.qualifiesForDemonstration");
  });

  it("still creates and retains failed evidence and its link", () => {
    // Nothing in the consumer filters on result state before linking.
    const linkSection = consumer.slice(
      consumer.indexOf("const mappings = await loadApprovedCompetencyMappings")
    );
    expect(linkSection).not.toContain('resultState === "passed"');
    expect(linkSection).not.toContain('resultState !== "failed"');
  });
});

describe("student read surface", () => {
  it("exposes an authenticated attempt evidence route", () => {
    expect(server).toContain("assessmentEvidenceMatch");
    expect(server).toContain("getAssessmentAttemptEvidenceId(trusted.identity.userId");
    expect(server).toContain("resolveTrustedRequestIdentity(request)");
  });

  it("creates no student evidence mutation route", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(
        new RegExp(
          `request\\.method === "${method}"[\\s\\S]{0,120}assessmentEvidenceMatch`
        ).test(server)
      ).toBe(false);
    }
    expect(server).not.toContain("consumeAssessmentEvidenceHandoff");
  });
});
