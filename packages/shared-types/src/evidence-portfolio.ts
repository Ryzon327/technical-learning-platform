import type { EvidenceMetadata, EvidenceRecordState, EvidenceSourceType } from "./evidence";
import { EVIDENCE_SOURCE_TYPES, isEvidenceSourceType } from "./evidence";
import type {
  EvidenceOutcome,
  StudentEvidenceCompetencyLink
} from "./evidence-competency";
import {
  deriveEvidenceOutcome,
  qualifiesAsDemonstrationEvidence
} from "./evidence-competency";

/**
 * Wave 7 / Batch 6 — EVID-007 Student Evidence Portfolio View.
 *
 * A private, student-scoped read model. It composes Evidence (Batch 1),
 * competency links (Batch 2), effective correction state (Batch 5) and
 * curriculum context, and is authoritative for none of them.
 *
 * Pure module: no I/O, no randomness, no AI. Every function here is a
 * projection or a filter over data the platform already owns.
 */

export const EVIDENCE_PORTFOLIO_DEFAULT_LIMIT = 50;
export const EVIDENCE_PORTFOLIO_MAX_LIMIT = 200;

/**
 * Curriculum context resolved by the Curriculum layer, never re-derived here.
 *
 * Keyed by the EXACT competency reference, not the stable id alone: different
 * versions of one competency may be mapped to different missions and therefore
 * different courses, and historical Evidence must keep the context that was in
 * force for the version it was linked against.
 */
export interface CompetencyCurriculumContext {
  competencyStableId: string;
  competencyVersion: number;
  courseStableId?: string;
  courseTitle?: string;
  moduleStableId?: string;
  missionStableId?: string;
}

/** An exact competency reference: stable id plus the pinned version. */
export interface CompetencyReference {
  competencyStableId: string;
  competencyVersion: number;
}

/**
 * Canonical key preserving version authority. Used for every curriculum lookup
 * so a later version can never supply context for older Evidence.
 */
export function competencyReferenceKey(
  reference: CompetencyReference
): string {
  return `${reference.competencyStableId}@${reference.competencyVersion}`;
}

export interface EvidencePortfolioFilters {
  competencyStableId?: string;
  sourceType?: EvidenceSourceType;
  courseStableId?: string;
  limit?: number;
}

/**
 * One portfolio entry. Student-safe by construction: it carries no digests, no
 * provider or session identifiers, no actor information and no internal audit
 * metadata.
 */
export interface EvidencePortfolioItem {
  evidenceId: string;
  sourceType: EvidenceSourceType;
  /** Student-friendly label such as an assessment or lab name. */
  sourceLabel: string;
  /** Readable outcome word, when the source engine recorded one. */
  outcomeLabel?: string;
  occurredAt: string;
  recordedAt: string;
  effectiveState: EvidenceRecordState;
  /** Authoritative source-engine outcome, from the canonical Batch 3/5 rule. */
  evidenceOutcome: EvidenceOutcome;
  /** Readable status text. Never conveyed by colour or badge alone. */
  statusLabel: string;
  underReview: boolean;
  /** True only for Evidence that currently counts as trusted proof. */
  isCurrentProof: boolean;
  correctionCount: number;
  lastCorrectionReason?: string;
  supersededByEvidenceId?: string;
  competencies: StudentEvidenceCompetencyLink[];
  curriculum: CompetencyCurriculumContext[];
}

export interface EvidencePortfolioCompetencyGroup {
  competencyStableId: string;
  competencyVersion: number;
  competencyTitle?: string;
  courseStableId?: string;
  courseTitle?: string;
  /** Items in this group that currently count as trusted proof. */
  currentProofCount: number;
  items: EvidencePortfolioItem[];
}

/** An item whose detail could not be loaded. Identified, never hidden. */
export interface EvidencePortfolioUnavailableItem {
  evidenceId: string;
  reason: string;
}

export interface EvidencePortfolio {
  items: EvidencePortfolioItem[];
  groups: EvidencePortfolioCompetencyGroup[];
  /** Items with no competency link yet, so nothing is silently dropped. */
  ungroupedItems: EvidencePortfolioItem[];
  unavailableItems: EvidencePortfolioUnavailableItem[];
  appliedFilters: EvidencePortfolioFilters;
  availableFilters: EvidencePortfolioFilterOptions;
  totalCount: number;
}

/** Filter choices derived from the student's own Evidence only. */
export interface EvidencePortfolioFilterOptions {
  sourceTypes: Array<{ value: EvidenceSourceType; label: string }>;
  competencies: Array<{
    competencyStableId: string;
    competencyVersion: number;
    label: string;
  }>;
  courses: Array<{ courseStableId: string; label: string }>;
}

export function normalizePortfolioLimit(value: unknown): number {
  const parsed = Number(value ?? EVIDENCE_PORTFOLIO_DEFAULT_LIMIT);
  if (!Number.isFinite(parsed)) return EVIDENCE_PORTFOLIO_DEFAULT_LIMIT;
  return Math.max(1, Math.min(EVIDENCE_PORTFOLIO_MAX_LIMIT, Math.floor(parsed)));
}

function normalizeIdentifier(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (trimmed === "" || trimmed.length > 200) return undefined;
  return trimmed;
}

/**
 * Normalizes untrusted query input. Unknown filter values are dropped rather
 * than rejected, so a stale bookmark degrades to a broader portfolio instead of
 * an error.
 */
export function normalizePortfolioFilters(
  value: Record<string, unknown> | undefined
): EvidencePortfolioFilters {
  const source = value ?? {};
  const sourceType = source.sourceType;

  return {
    ...(normalizeIdentifier(source.competencyStableId)
      ? { competencyStableId: normalizeIdentifier(source.competencyStableId) as string }
      : {}),
    ...(isEvidenceSourceType(sourceType) ? { sourceType } : {}),
    ...(normalizeIdentifier(source.courseStableId)
      ? { courseStableId: normalizeIdentifier(source.courseStableId) as string }
      : {}),
    limit: normalizePortfolioLimit(source.limit)
  };
}

/** Student-friendly wording for a canonical source type. */
export function describeEvidenceSourceType(sourceType: EvidenceSourceType): string {
  switch (sourceType) {
    case "assessment_attempt":
      return "Assessment";
    case "lab_validation":
      return "Hands-on lab";
    case "manual_authoritative":
      return "Reviewed by the platform team";
    case "system_authoritative":
      return "Recorded by the platform";
    default:
      return "Evidence";
  }
}

/**
 * A recognisable name for the item, taken from the bounded metadata the source
 * engines already record. Falls back to the type label rather than exposing a
 * raw reference.
 */
export function buildEvidenceSourceLabel(
  sourceType: EvidenceSourceType,
  metadata: EvidenceMetadata
): string {
  const assessmentTitle = metadata.assessmentTitle;
  if (typeof assessmentTitle === "string" && assessmentTitle.trim() !== "") {
    return assessmentTitle;
  }

  const labName = metadata.labName;
  if (typeof labName === "string" && labName.trim() !== "") {
    return labName;
  }

  return describeEvidenceSourceType(sourceType);
}

/** Readable outcome wording. Returns undefined when no outcome was recorded. */
export function describeEvidenceOutcomeLabel(
  metadata: EvidenceMetadata
): string | undefined {
  switch (metadata.resultState) {
    case "passed":
      return "Passed";
    case "failed":
      return "Not passed";
    case "incomplete":
      return "Not yet complete";
    default:
      return undefined;
  }
}

/**
 * Readable status text for an effective state.
 *
 * EVID-007 §10 forbids colour-only meaning, so every status a student sees is a
 * full sentence fragment rather than a badge word.
 */
export function describeEffectiveStatus(
  effectiveState: EvidenceRecordState,
  underReview: boolean
): string {
  if (underReview) {
    return effectiveState === "active"
      ? "Current evidence — under review"
      : `${describeEffectiveStatus(effectiveState, false)} — under review`;
  }

  switch (effectiveState) {
    case "active":
      return "Current evidence";
    case "invalidated":
      return "No longer valid — kept for your records";
    case "superseded":
      return "Replaced by newer evidence — kept for your records";
    default:
      return "Status unavailable";
  }
}

/**
 * Whether an item currently counts as trusted proof of demonstration.
 *
 * Reuses the canonical outcome semantics established by Batch 3 and Batch 4 and
 * the demonstration rule from Batch 5 — the portfolio defines no competing
 * rule of its own. All three conditions must hold:
 *
 *   positive source-engine outcome   (a failed assessment or an incomplete lab
 *                                     is negative and never qualifies)
 *   + effective state `active`       (invalidated and superseded never qualify)
 *   + integrity `verified`
 *
 * Fails closed: an absent or unrecognised outcome is indeterminate and does not
 * qualify. Restoring Evidence restores only its effective state — a restored
 * negative result remains non-qualifying.
 */
export function isCurrentProof(input: {
  effectiveState: EvidenceRecordState;
  integrityState: string;
  /** The source engine's recorded result, as carried in Evidence metadata. */
  resultState?: unknown;
}): boolean {
  return (
    input.effectiveState === "active" &&
    input.integrityState === "verified" &&
    qualifiesAsDemonstrationEvidence(deriveEvidenceOutcome(input.resultState))
  );
}

/**
 * Applies filters to the flat item list. Filtering constrains the result first;
 * grouping is a presentation of the filtered result, never its own source.
 */
export function filterPortfolioItems(
  items: readonly EvidencePortfolioItem[],
  filters: EvidencePortfolioFilters
): EvidencePortfolioItem[] {
  return items.filter((item) => {
    if (filters.sourceType && item.sourceType !== filters.sourceType) {
      return false;
    }

    if (
      filters.competencyStableId &&
      !item.competencies.some(
        (link) => link.competencyStableId === filters.competencyStableId
      )
    ) {
      return false;
    }

    if (
      filters.courseStableId &&
      !item.curriculum.some(
        (context) => context.courseStableId === filters.courseStableId
      )
    ) {
      return false;
    }

    return true;
  });
}

function courseContextFor(
  item: EvidencePortfolioItem,
  reference: CompetencyReference
): CompetencyCurriculumContext | undefined {
  const key = competencyReferenceKey(reference);
  return item.curriculum.find(
    (context) => competencyReferenceKey(context) === key
  );
}

/**
 * Groups filtered items by the competency they support. An item supporting
 * several competencies appears under each, which is the point of the view.
 */
export function groupPortfolioItemsByCompetency(
  items: readonly EvidencePortfolioItem[]
): EvidencePortfolioCompetencyGroup[] {
  const groups = new Map<string, EvidencePortfolioCompetencyGroup>();

  for (const item of items) {
    for (const link of item.competencies) {
      const key = competencyReferenceKey(link);
      const context = courseContextFor(item, link);
      const existing = groups.get(key);

      if (existing) {
        existing.items.push(item);
        if (item.isCurrentProof) {
          existing.currentProofCount += 1;
        }
        continue;
      }

      groups.set(key, {
        competencyStableId: link.competencyStableId,
        competencyVersion: link.competencyVersion,
        ...(link.competencyTitle ? { competencyTitle: link.competencyTitle } : {}),
        ...(context?.courseStableId ? { courseStableId: context.courseStableId } : {}),
        ...(context?.courseTitle ? { courseTitle: context.courseTitle } : {}),
        currentProofCount: item.isCurrentProof ? 1 : 0,
        items: [item]
      });
    }
  }

  return [...groups.values()].sort((a, b) => {
    const left = a.competencyTitle ?? a.competencyStableId;
    const right = b.competencyTitle ?? b.competencyStableId;
    if (left !== right) return left < right ? -1 : 1;
    return a.competencyVersion - b.competencyVersion;
  });
}

/** Items with no competency link, surfaced rather than silently dropped. */
export function selectUngroupedItems(
  items: readonly EvidencePortfolioItem[]
): EvidencePortfolioItem[] {
  return items.filter((item) => item.competencies.length === 0);
}

/** Filter choices derived from the student's own unfiltered Evidence. */
export function buildPortfolioFilterOptions(
  items: readonly EvidencePortfolioItem[]
): EvidencePortfolioFilterOptions {
  const sourceTypes = new Set<EvidenceSourceType>();
  const competencies = new Map<
    string,
    { competencyStableId: string; competencyVersion: number; label: string }
  >();
  const courses = new Map<string, { courseStableId: string; label: string }>();

  for (const item of items) {
    sourceTypes.add(item.sourceType);

    for (const link of item.competencies) {
      const key = competencyReferenceKey(link);
      if (!competencies.has(key)) {
        competencies.set(key, {
          competencyStableId: link.competencyStableId,
          competencyVersion: link.competencyVersion,
          label: link.competencyTitle ?? link.competencyStableId
        });
      }
    }

    for (const context of item.curriculum) {
      if (context.courseStableId && !courses.has(context.courseStableId)) {
        courses.set(context.courseStableId, {
          courseStableId: context.courseStableId,
          label: context.courseTitle ?? context.courseStableId
        });
      }
    }
  }

  return {
    sourceTypes: (EVIDENCE_SOURCE_TYPES as readonly EvidenceSourceType[])
      .filter((value) => sourceTypes.has(value))
      .map((value) => ({ value, label: describeEvidenceSourceType(value) })),
    competencies: [...competencies.values()].sort((a, b) =>
      a.label < b.label ? -1 : a.label > b.label ? 1 : 0
    ),
    courses: [...courses.values()].sort((a, b) =>
      a.label < b.label ? -1 : a.label > b.label ? 1 : 0
    )
  };
}

/** Readable absolute date for display. Never a relative or colour-coded value. */
export function formatPortfolioDate(value: string): string {
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return "Date unavailable";
  }
  return new Date(parsed).toISOString().slice(0, 10);
}

/** Assembles the portfolio from already-projected items. Pure. */
export function assembleEvidencePortfolio(input: {
  items: readonly EvidencePortfolioItem[];
  filters: EvidencePortfolioFilters;
  unavailableItems?: readonly EvidencePortfolioUnavailableItem[];
}): EvidencePortfolio {
  const filtered = filterPortfolioItems(input.items, input.filters).slice(
    0,
    normalizePortfolioLimit(input.filters.limit)
  );

  return {
    items: filtered,
    groups: groupPortfolioItemsByCompetency(filtered),
    ungroupedItems: selectUngroupedItems(filtered),
    unavailableItems: [...(input.unavailableItems ?? [])],
    appliedFilters: input.filters,
    availableFilters: buildPortfolioFilterOptions(input.items),
    totalCount: filtered.length
  };
}
