import {
  assembleEvidencePortfolio,
  buildEvidenceSourceLabel,
  describeEffectiveStatus,
  describeEvidenceOutcomeLabel,
  competencyReferenceKey,
  deriveEvidenceOutcome,
  isCurrentProof,
  normalizePortfolioFilters,
  type CompetencyCurriculumContext,
  type CompetencyReference,
  type EvidencePortfolio,
  type EvidencePortfolioFilters,
  type EvidencePortfolioItem,
  type EvidencePortfolioUnavailableItem,
  type StudentEvidenceCompetencyLink,
  type StudentEvidenceRecordWithState
} from "@tlp/shared-types";
import { resolveCompetencyCurriculumContext } from "./curriculum";
import { listStudentEvidence } from "./evidence";
import { listEvidenceCompetencyLinksForEvidenceIds } from "./evidence-competency";

/**
 * Wave 7 / Batch 6 — EVID-007 Student Evidence Portfolio View.
 *
 * A non-authoritative read model. It composes:
 *
 *   listStudentEvidence                        Batch 1 record + Batch 5 effective state
 *   listEvidenceCompetencyLinksForEvidenceIds  Batch 2 approved links
 *   resolveCompetencyCurriculumContext         Curriculum-owned course relationship
 *
 * It derives no Evidence status of its own, owns no competency mapping, walks
 * no curriculum tables, and writes nothing. Ownership is enforced throughout by
 * RLS through the user-scoped accessors it calls, so an identifier supplied by
 * one student can never surface another student's Evidence.
 *
 * There is no AI in this module.
 */

function projectItem(
  record: StudentEvidenceRecordWithState,
  links: StudentEvidenceCompetencyLink[],
  curriculumByCompetency: Map<string, CompetencyCurriculumContext>
): EvidencePortfolioItem {
  const curriculum: CompetencyCurriculumContext[] = [];
  for (const link of links) {
    // Looked up by the exact pinned version, never by stable id alone.
    const context = curriculumByCompetency.get(competencyReferenceKey(link));
    if (context) {
      curriculum.push(context);
    }
  }

  const outcomeLabel = describeEvidenceOutcomeLabel(record.metadata);

  return {
    evidenceId: record.id,
    sourceType: record.sourceType,
    sourceLabel: buildEvidenceSourceLabel(record.sourceType, record.metadata),
    ...(outcomeLabel ? { outcomeLabel } : {}),
    occurredAt: record.sourceOccurredAt,
    recordedAt: record.recordedAt,
    effectiveState: record.effectiveState,
    evidenceOutcome: deriveEvidenceOutcome(record.metadata.resultState),
    statusLabel: describeEffectiveStatus(record.effectiveState, record.underReview),
    underReview: record.underReview,
    // Qualification reuses the canonical Batch 3/4/5 outcome rule: a failed
    // assessment or an incomplete lab is negative and never current proof.
    isCurrentProof: isCurrentProof({
      effectiveState: record.effectiveState,
      integrityState: record.integrityState,
      resultState: record.metadata.resultState
    }),
    correctionCount: record.correctionCount,
    ...(record.lastCorrectionReason
      ? { lastCorrectionReason: record.lastCorrectionReason }
      : {}),
    ...(record.supersededByEvidenceId
      ? { supersededByEvidenceId: record.supersededByEvidenceId }
      : {}),
    competencies: links,
    curriculum
  };
}

/**
 * Builds the private portfolio for the authenticated student.
 *
 * Failure behaviour follows EVID-007 §12: if competency links or curriculum
 * context cannot be loaded, the broader portfolio is preserved, the affected
 * detail is identified in `unavailableItems`, and no status is hidden or
 * fabricated.
 */
export async function getStudentEvidencePortfolio(
  accessToken: string,
  rawFilters: Record<string, unknown> | undefined
): Promise<EvidencePortfolio> {
  const filters: EvidencePortfolioFilters = normalizePortfolioFilters(rawFilters);
  const unavailableItems: EvidencePortfolioUnavailableItem[] = [];

  const records = await listStudentEvidence(accessToken);

  if (records.length === 0) {
    return assembleEvidencePortfolio({ items: [], filters, unavailableItems });
  }

  const evidenceIds = records.map((record) => record.id);

  let linksByEvidence = new Map<string, StudentEvidenceCompetencyLink[]>();
  try {
    linksByEvidence = await listEvidenceCompetencyLinksForEvidenceIds(
      accessToken,
      evidenceIds
    );
  } catch {
    // Preserve the portfolio; identify what could not be loaded.
    for (const id of evidenceIds) {
      unavailableItems.push({
        evidenceId: id,
        reason: "Supported competencies could not be loaded."
      });
    }
  }

  // Exact references, so historical Evidence keeps the curriculum context of
  // the competency version it was actually linked against.
  const referencesByKey = new Map<string, CompetencyReference>();
  for (const links of linksByEvidence.values()) {
    for (const link of links) {
      referencesByKey.set(competencyReferenceKey(link), {
        competencyStableId: link.competencyStableId,
        competencyVersion: link.competencyVersion
      });
    }
  }
  const competencyReferences = [...referencesByKey.values()];

  let curriculumByCompetency = new Map<string, CompetencyCurriculumContext>();
  if (competencyReferences.length > 0) {
    try {
      curriculumByCompetency = await resolveCompetencyCurriculumContext(
        accessToken,
        competencyReferences
      );
    } catch {
      // Course context is supplementary; the portfolio remains usable without it.
      unavailableItems.push({
        evidenceId: "",
        reason: "Course context could not be loaded for some competencies."
      });
    }
  }

  const items = records.map((record) =>
    projectItem(
      record,
      linksByEvidence.get(record.id) ?? [],
      curriculumByCompetency
    )
  );

  return assembleEvidencePortfolio({ items, filters, unavailableItems });
}
