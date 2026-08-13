import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { calculateEvidenceIntegrityDigest } from "./evidence";
import type { EvidenceCanonicalDigestInput } from "@tlp/shared-types";

const SOURCE_DIGEST = "a1".repeat(32);

function digestInput(
  overrides: Partial<EvidenceCanonicalDigestInput> = {}
): EvidenceCanonicalDigestInput {
  return {
    userId: "11111111-1111-4111-8111-111111111111",
    sourceType: "assessment_attempt",
    sourceReference: "assessment-attempt:attempt-1",
    sourceEngine: "assessment",
    sourceOccurredAt: "2026-08-13T00:00:00.000Z",
    sourceIntegrityDigest: SOURCE_DIGEST,
    ...overrides
  };
}

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

describe("evidence integrity", () => {
  it("F: creates deterministic evidence integrity digests", () => {
    const input = digestInput();
    expect(calculateEvidenceIntegrityDigest(input)).toBe(
      calculateEvidenceIntegrityDigest(input)
    );
  });

  it("G: produces the same digest for the same canonical input", () => {
    expect(
      calculateEvidenceIntegrityDigest(
        digestInput({ sourceOccurredAt: "2026-08-13T00:00:00Z" })
      )
    ).toBe(calculateEvidenceIntegrityDigest(digestInput()));
  });

  it("H: changes the digest when provenance changes materially", () => {
    const base = calculateEvidenceIntegrityDigest(digestInput());

    expect(
      calculateEvidenceIntegrityDigest(digestInput({ sourceEngine: "lab" }))
    ).not.toBe(base);
    expect(
      calculateEvidenceIntegrityDigest(
        digestInput({ sourceReference: "assessment-attempt:attempt-2" })
      )
    ).not.toBe(base);
    expect(
      calculateEvidenceIntegrityDigest(
        digestInput({
          sourceIntegrityDigest: "b2".repeat(32)
        })
      )
    ).not.toBe(base);
  });

  it("emits a lowercase hex SHA-256 digest", () => {
    expect(calculateEvidenceIntegrityDigest(digestInput())).toMatch(
      /^[a-f0-9]{64}$/
    );
  });
});

describe("evidence trust boundaries", () => {
  const evidenceService = read("./evidence.ts");
  const server = read("./server.ts");

  it("M: canonical creation uses the server-authoritative client", () => {
    expect(evidenceService).toContain("createServerSupabaseClient()");
    expect(evidenceService).toContain("createCanonicalEvidence");
    expect(evidenceService).toContain("node:crypto");
  });

  it("K: student reads go through the user-scoped client only", () => {
    const listing = evidenceService.slice(
      evidenceService.indexOf("export async function listStudentEvidence")
    );
    expect(listing).toContain("createUserScopedSupabaseClient(accessToken)");
    expect(listing).not.toContain("createServerSupabaseClient()");
  });

  it("L: no student Evidence creation route exists", () => {
    expect(server).not.toMatch(/"POST"[\s\S]{0,80}pathname === "\/evidence"/);
    expect(server).not.toMatch(/pathname === "\/evidence"[\s\S]{0,80}"POST"/);
    expect(server).not.toContain("createCanonicalEvidence");
  });

  it("N: student routes cannot supply provenance or identity", () => {
    const evidenceRoutes = server.slice(
      server.indexOf('pathname === "/evidence"'),
      server.indexOf('pathname === "/evidence"') + 900
    );
    expect(evidenceRoutes).toContain("resolveTrustedRequestIdentity(request)");
    expect(evidenceRoutes).not.toContain("readJsonBody");
    expect(evidenceRoutes).not.toContain("sourceIntegrityDigest");
    expect(evidenceRoutes).not.toContain("integrityState");
  });

  it("keeps AI out of the Evidence truth path", () => {
    expect(evidenceService).not.toMatch(
      /openai|anthropic|ollama|ai[-_ ]?gateway/i
    );
  });

  it("does not consume assessment or lab handoffs yet", () => {
    expect(evidenceService).not.toContain("assessment_evidence_handoffs");
    expect(evidenceService).not.toContain("lab_validation_runs");
    expect(evidenceService).not.toContain("student_competency_evidence_refs");
  });

  it("does not log raw Evidence metadata", () => {
    const auditBlocks = evidenceService.match(/writeAuditEvent\({[\s\S]*?\}\);/g) ?? [];
    expect(auditBlocks.length).toBeGreaterThan(0);
    for (const block of auditBlocks) {
      expect(block).not.toContain("metadata: record.metadata");
      expect(block).not.toContain("metadata: input.metadata");
    }
  });
});
