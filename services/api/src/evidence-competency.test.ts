import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mapEvidenceCompetencyLinkRow } from "./evidence-competency";

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

const service = read("./evidence-competency.ts");
const server = read("./server.ts");
const competencyService = read("./competency.ts");
const migration = read(
  "../../../supabase/migrations/20260813000200_evidence_competency_linking.sql"
);
const competencyMigration = read(
  "../../../supabase/migrations/20260811000900_competency_state_foundation.sql"
);

describe("evidence competency link mapping", () => {
  it("maps a stored link row into the canonical shape", () => {
    const link = mapEvidenceCompetencyLinkRow({
      id: "link-1",
      evidence_id: "evidence-1",
      user_id: "user-1",
      competency_id: "competency-row-1",
      competency_stable_id: "competency.network.subnetting",
      competency_version: 2,
      relationship: "required",
      link_source: "approved_curriculum_mapping",
      metadata: { approvedBy: "curriculum-config" },
      linked_at: "2026-08-13T00:00:00.000Z"
    });

    expect(link.competencyVersion).toBe(2);
    expect(link.relationship).toBe("required");
    expect(link.linkSource).toBe("approved_curriculum_mapping");
  });

  it("fails closed on a non-canonical stored relationship", () => {
    expect(() =>
      mapEvidenceCompetencyLinkRow({
        id: "link-1",
        evidence_id: "evidence-1",
        user_id: "user-1",
        competency_id: "competency-row-1",
        competency_stable_id: "competency.network.subnetting",
        competency_version: 2,
        relationship: "mastered",
        link_source: "approved_curriculum_mapping",
        metadata: {},
        linked_at: "2026-08-13T00:00:00.000Z"
      })
    ).toThrow();
  });

  it("fails closed on a non-canonical stored link source", () => {
    expect(() =>
      mapEvidenceCompetencyLinkRow({
        id: "link-1",
        evidence_id: "evidence-1",
        user_id: "user-1",
        competency_id: "competency-row-1",
        competency_stable_id: "competency.network.subnetting",
        competency_version: 2,
        relationship: "required",
        link_source: "ai_generated",
        metadata: {},
        linked_at: "2026-08-13T00:00:00.000Z"
      })
    ).toThrow();
  });
});

describe("evidence competency trust boundaries", () => {
  it("links only through the server-authoritative client", () => {
    expect(service).toContain("createServerSupabaseClient()");
    expect(service).toContain("linkEvidenceToCompetency");
    expect(service).toContain("evidence.competency.linked");
  });

  it("K: the Evidence Record owner is authoritative for the link", () => {
    expect(service).toContain("evidence.userId !== input.userId");
    expect(service).toContain('code: "FORBIDDEN"');
    expect(migration).toContain(
      "Evidence competency link owner must match the Evidence owner"
    );
  });

  it("F/G: only active verified Evidence may be linked", () => {
    expect(service).toContain("evaluateEvidenceLinkEligibility");
    expect(migration).toContain("evidence_state <> 'active'");
    expect(migration).toContain("evidence_integrity <> 'verified'");
  });

  it("H/I: missing Evidence and missing competency are rejected", () => {
    expect(service).toContain("Evidence Record was not found");
    expect(service).toContain(
      "Competency definition was not found for the requested version"
    );
  });

  it("N: student reads go through the user-scoped client", () => {
    const readSection = service.slice(service.indexOf("loadStudentLinksBy"));
    expect(readSection).toContain("createUserScopedSupabaseClient(accessToken)");
  });

  it("B/T: the exact competency definition reference is preserved", () => {
    expect(service).toContain("competency_stable_id: definition.stableId");
    expect(service).toContain("competency_version: definition.version");
    expect(migration).toContain(
      "must preserve the exact competency definition reference"
    );
  });
});

describe("evidence competency HTTP surface", () => {
  it("L/M: no student create, update or delete route exists", () => {
    for (const method of ["POST", "PUT", "PATCH", "DELETE"]) {
      expect(
        new RegExp(
          `request\\.method === "${method}"[\\s\\S]{0,120}(evidenceCompetenc|competencyEvidence)`
        ).test(server)
      ).toBe(false);
    }
    expect(server).not.toContain("linkEvidenceToCompetency");
  });

  it("N: read routes require trusted request identity", () => {
    expect(server).toContain("evidenceCompetencyMatch");
    expect(server).toContain("competencyEvidenceMatch");
    expect(server).toContain("listEvidenceCompetencyLinks(trusted.accessToken");
    expect(server).toContain("listCompetencyEvidenceLinks(trusted.accessToken");
  });
});

describe("learning engine and source engine boundaries", () => {
  it("P: the existing competency evidence mechanism is untouched", () => {
    expect(competencyService).toContain(
      "export async function recordAuthoritativeCompetencyEvidence"
    );
    expect(competencyMigration).toContain(
      "create table if not exists public.student_competency_evidence_refs"
    );
    expect(migration).not.toContain("student_competency_evidence_refs");
    expect(migration).not.toContain("drop table");
  });

  it("does not mutate competency state or mastery", () => {
    expect(service).not.toContain("student_competency_state");
    expect(service).not.toContain("recordAuthoritativeCompetencyEvidence");
    expect(service).not.toContain("decideCompetencyTransition");
    expect(service).not.toContain("markCompetencyDemonstrated");
  });

  it("R: no assessment handoff is automatically consumed", () => {
    expect(service).not.toContain("assessment_evidence_handoffs");
    expect(migration).not.toContain("assessment_evidence_handoffs");
  });

  it("S: no lab validation result is automatically consumed", () => {
    expect(service).not.toContain("lab_validation_runs");
    expect(service).not.toContain("lab_validation_results");
    expect(migration).not.toContain("lab_validation");
  });

  it("O: AI has no authority in the mapping truth path", () => {
    expect(service).not.toMatch(/openai|anthropic|ollama|ai[-_ ]?gateway/i);
    expect(migration).not.toMatch(/ai_generated|llm|model_decision/i);
  });

  it("exposes a read-only Learning Engine integration contract", () => {
    expect(service).toContain(
      "export async function getAuthoritativeCompetencyEvidenceReferences"
    );
    const adapter = service.slice(
      service.indexOf("export async function getAuthoritativeCompetencyEvidenceReferences")
    );
    expect(adapter).not.toContain(".insert(");
    expect(adapter).not.toContain(".update(");
    expect(adapter).not.toContain(".upsert(");
  });

  it("does not log large evidence metadata bodies", () => {
    const auditBlocks = service.match(/writeAuditEvent\({[\s\S]*?\}\);/g) ?? [];
    expect(auditBlocks.length).toBeGreaterThan(0);
    for (const block of auditBlocks) {
      expect(block).not.toContain("metadata: link.metadata");
      expect(block).not.toContain("metadata: input.metadata");
      expect(block).not.toContain("evidence.metadata");
    }
  });
});
