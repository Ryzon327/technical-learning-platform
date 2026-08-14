import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  calculateLabMappingAuthorityDigest,
  calculateLabValidationSourceDigest
} from "./lab-evidence";
import type { LabEvidenceSourceFacts } from "@tlp/shared-types";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const consumer = read("./lab-evidence.ts");
const runtime = read("./lab-runtime.ts");
const linkService = read("./evidence-competency.ts");
const server = read("./server.ts");
const migration = read(
  "../../../supabase/migrations/20260813000400_lab_evidence_consumption.sql"
);
const validationMigration = read(
  "../../../supabase/migrations/20260812001000_lab_access_reset_validation.sql"
);

function facts(
  overrides: Partial<LabEvidenceSourceFacts> = {}
): LabEvidenceSourceFacts {
  return {
    validationRunId: "11111111-1111-4111-8111-111111111111",
    labSessionId: "22222222-2222-4222-8222-222222222222",
    userId: "33333333-3333-4333-8333-333333333333",
    profileStableId: "profile.network.subnetting",
    labDefinitionStableId: "lab.network.subnetting",
    labDefinitionVersion: 2,
    labName: "Configure IPv4 subnets",
    missionStableId: "mission.network.addressing",
    runState: "passed",
    checkedAt: "2026-08-13T00:00:00.000Z",
    mappingAuthorityDigest: "c3".repeat(32),
    results: [
      {
        checkStableId: "check.service.listening",
        title: "Service is listening",
        required: true,
        passed: true,
        state: "passed",
        explanation: ""
      }
    ],
    ...overrides
  };
}

describe("lab source integrity digest", () => {
  it("E: is deterministic across repeated derivation", () => {
    const value = facts();
    expect(calculateLabValidationSourceDigest(value)).toBe(
      calculateLabValidationSourceDigest(value)
    );
    expect(calculateLabValidationSourceDigest(value)).toMatch(/^[a-f0-9]{64}$/);
  });

  it("F: diverges when an authoritative validation fact changes", () => {
    const base = calculateLabValidationSourceDigest(facts());
    expect(
      calculateLabValidationSourceDigest(facts({ runState: "incomplete" }))
    ).not.toBe(base);
    expect(
      calculateLabValidationSourceDigest(
        facts({ validationRunId: "44444444-4444-4444-8444-444444444444" })
      )
    ).not.toBe(base);
  });
});

describe("lab evidence pipeline", () => {
  it("A/B: consumption creates canonical Evidence and approved links", () => {
    expect(consumer).toContain("createCanonicalEvidence(");
    expect(consumer).toContain("linkEvidenceToCompetency(");
    expect(consumer).toContain('sourceType: "lab_validation"');
    expect(consumer).toContain('sourceEngine: "lab"');
    expect(consumer).toContain("buildLabValidationSourceReference(");
    expect(consumer).toContain("sourceOccurredAt: facts.checkedAt");
  });

  it("C/D: ineligible runs are skipped rather than recorded", () => {
    expect(consumer).toContain("evaluateLabEvidenceEligibility");
    const skipSection = consumer.slice(
      consumer.indexOf("if (!eligibility.eligible)"),
      consumer.indexOf("const metadata = buildLabEvidenceMetadata")
    );
    expect(skipSection).toContain('state: "skipped"');
    expect(skipSection).not.toContain("createCanonicalEvidence");
    expect(skipSection).not.toContain("linkEvidenceToCompetency");
  });

  it("G/H: ownership comes from the authoritative lab data", () => {
    expect(consumer).toContain("baseFacts.userId !== trustedUserId");
    expect(consumer).toContain('code: "FORBIDDEN"');
    expect(consumer).toContain(
      "Lab validation run and lab session ownership diverge"
    );
    expect(migration).toContain(
      "Lab evidence consumption owner must match the validation run owner"
    );
  });

  it("F: the source digest changes when the frozen mapping authority changes", () => {
    const base = calculateLabValidationSourceDigest(facts());
    expect(
      calculateLabValidationSourceDigest(
        facts({ mappingAuthorityDigest: "d4".repeat(32) })
      )
    ).not.toBe(base);
  });

  it("derives a deterministic mapping authority digest", () => {
    const authority = {
      missionStableId: "mission.network.addressing",
      missionVersion: 3,
      missionId: "mission-row-v3",
      mappings: [
        {
          competencyStableId: "competency.network.subnetting",
          competencyVersion: 2,
          required: true
        }
      ],
      unresolvedCompetencyStableIds: []
    };
    expect(calculateLabMappingAuthorityDigest(authority)).toBe(
      calculateLabMappingAuthorityDigest(authority)
    );
    expect(calculateLabMappingAuthorityDigest(authority)).toMatch(
      /^[a-f0-9]{64}$/
    );
    expect(
      calculateLabMappingAuthorityDigest({ ...authority, missionVersion: 4 })
    ).not.toBe(calculateLabMappingAuthorityDigest(authority));
  });

  it("A-E: consumption links from the frozen handoff, never the current curriculum", () => {
    expect(consumer).toContain("captureLabEvidenceHandoff");
    expect(consumer).toContain("for (const mapping of authority.mappings)");
    // The current curriculum is resolved only while capturing the snapshot.
    const consumeSection = consumer.slice(
      consumer.indexOf("export async function consumeLabValidationEvidence")
    );
    expect(consumeSection).not.toContain("resolveCurrentMappingAuthority(");
    expect(consumer).toContain("resolveMappingAuthority(");
  });

  it("freezes the snapshot before any Evidence is created", () => {
    const consumeSection = consumer.slice(
      consumer.indexOf("export async function consumeLabValidationEvidence")
    );
    const capture = consumeSection.indexOf("captureLabEvidenceHandoff");
    const create = consumeSection.indexOf("createCanonicalEvidence(");
    expect(capture).toBeGreaterThan(-1);
    expect(create).toBeGreaterThan(capture);
  });

  it("writes the handoff immutably and never re-resolves an existing one", () => {
    expect(consumer).toContain("ignoreDuplicates: true");
    expect(consumer).toContain("loadFrozenMappingAuthority");
    expect(migration).toContain(
      "create table if not exists public.lab_evidence_handoffs"
    );
    expect(migration).toContain("Lab evidence handoff is immutable once captured");
    expect(migration).toContain(
      "Lab evidence handoff must pin the lab definition of its session"
    );
  });

  it("I: competency mappings come only from approved curriculum configuration", () => {
    expect(consumer).toContain("mission_competencies");
    expect(consumer).toContain("competencies");
    expect(consumer).toContain('linkSource: "approved_curriculum_mapping"');
    expect(consumer).toContain("competencyVersion: mapping.competencyVersion");
    // Never inferred from names, descriptions, commands or student activity.
    expect(consumer).not.toContain("description");
    expect(consumer).not.toContain("lab.evidence.infer");
  });

  it("I: an unresolvable competency is reported, never linked by guess", () => {
    expect(consumer).toContain("unresolved");
    expect(consumer).toContain("lab.evidence.competency_mapping_unresolved");
    expect(consumer).not.toContain("latestPublishedVersion");
  });

  it("J: holds no AI in the lab evidence truth path", () => {
    expect(consumer).not.toMatch(/openai|anthropic|ollama|ai[-_ ]?gateway/i);
    expect(migration).not.toMatch(/openai|anthropic|ollama/i);
  });

  it("S: never mutates mastery or competency state", () => {
    expect(consumer).not.toContain("student_competency_state");
    expect(consumer).not.toContain("recordAuthoritativeCompetencyEvidence");
    expect(consumer).not.toContain("decideCompetencyTransition");
    expect(migration).not.toContain("student_competency");
  });
});

describe("K/L: validation authority is never subordinate to ingestion", () => {
  it("ingests only after the run and results are persisted", () => {
    const validateSection = runtime.slice(
      runtime.indexOf("export async function validateLabSession")
    );
    const runInsert = validateSection.indexOf('from("lab_validation_runs")');
    const resultInsert = validateSection.indexOf('from("lab_validation_results")');
    const consume = validateSection.indexOf("tryConsumeLabValidationEvidence");
    expect(runInsert).toBeGreaterThan(-1);
    expect(consume).toBeGreaterThan(runInsert);
    expect(consume).toBeGreaterThan(resultInsert);
  });

  it("uses the non-throwing wrapper on the validation path", () => {
    expect(runtime).toContain("tryConsumeLabValidationEvidence");
    expect(runtime).not.toContain("consumeLabValidationEvidence(");
  });

  it("records and audits an ingestion failure instead of propagating it", () => {
    const start = consumer.indexOf(
      "export async function tryConsumeLabValidationEvidence"
    );
    const wrapper = consumer.slice(
      start,
      consumer.indexOf("export async function", start + 1)
    );
    expect(wrapper).toContain("catch (error)");
    expect(wrapper).toContain("lab.evidence.consumption_failed");
    expect(wrapper).toContain('state: "failed"');
    expect(wrapper).not.toContain("throw");
  });

  it("K: never writes to lab validation runs, results or sessions", () => {
    for (const table of [
      "lab_validation_runs",
      "lab_validation_results",
      "lab_sessions"
    ]) {
      expect(
        new RegExp(
          `from\\("${table}"\\)[\\s\\S]{0,120}\\.(update|upsert|insert|delete)\\(`
        ).test(consumer)
      ).toBe(false);
    }
    expect(consumer).not.toContain("runValidationProbe");
    expect(consumer).not.toContain("deriveLabValidationState");
  });

  it("leaves the Wave 6 validation schema unchanged", () => {
    expect(validationMigration).toContain(
      "create table if not exists public.lab_validation_runs"
    );
    expect(migration).not.toContain("alter table public.lab_validation_runs");
    expect(migration).not.toContain("alter table public.lab_sessions");
    expect(migration).not.toContain("drop table");
  });

  it("L: ingestion is durably retryable", () => {
    expect(migration).toContain(
      "create table if not exists public.lab_evidence_consumptions"
    );
    expect(migration).toContain("state in ('consumed', 'skipped', 'failed')");
    expect(consumer).toContain(
      "export async function retryFailedLabEvidenceConsumption"
    );
    expect(consumer).toContain("recordConsumptionState");
  });

  it("keeps ingestion bookkeeping from becoming a second failure mode", () => {
    const bookkeeping = consumer.slice(
      consumer.indexOf("async function recordConsumptionState"),
      consumer.indexOf("async function loadLabEvidenceFacts")
    );
    expect(bookkeeping).toContain("catch");
    expect(bookkeeping).not.toContain("throw");
  });
});

describe("M/N/O: student boundary", () => {
  it("M: no student route can create or mutate lab Evidence", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(
        new RegExp(
          `request\\.method === "${method}"[\\s\\S]{0,120}labSessionEvidenceMatch`
        ).test(server)
      ).toBe(false);
    }
    expect(server).not.toContain("consumeLabValidationEvidence");
    expect(server).not.toContain("calculateLabValidationSourceDigest");
  });

  it("N: the lab Evidence read route requires trusted identity", () => {
    expect(server).toContain("labSessionEvidenceMatch");
    expect(server).toContain("resolveTrustedRequestIdentity(request)");
    expect(server).toContain(
      "listLabSessionEvidenceIds(trusted.identity.userId"
    );
  });

  it("O: reads are scoped to the owning student", () => {
    expect(consumer).toContain('.eq("user_id", trustedUserId)');
    expect(server).toContain("getCanonicalEvidenceForStudent(trusted.accessToken");
    expect(server).toContain("listEvidenceCompetencyLinks(trusted.accessToken");
  });

  it("internal consumption state carries no student policy", () => {
    expect(migration).toContain(
      "alter table public.lab_evidence_consumptions enable row level security"
    );
    expect(migration.toLowerCase()).not.toContain("create policy");
  });
});

describe("P/Q: outcome qualification integration", () => {
  it("P: the qualifying adapter still filters to positive evidence", () => {
    expect(linkService).toContain(
      "export async function getQualifyingCompetencyEvidenceReferences"
    );
    expect(linkService).toContain("reference.qualifiesForDemonstration");
  });

  it("Q: negative lab evidence remains available historically", () => {
    expect(linkService).toContain(
      "export async function getAuthoritativeCompetencyEvidenceReferences"
    );
    // Nothing in the consumer withholds a link for a negative outcome.
    const linkSection = consumer.slice(
      consumer.indexOf("const { mappings, unresolved }")
    );
    expect(linkSection).not.toContain('runState === "passed"');
    expect(linkSection).not.toContain('runState !== "incomplete"');
  });
});
