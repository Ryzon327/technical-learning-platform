import { describe, expect, it } from "vitest";
import {
  ROAS_COMPETENCIES,
  ROAS_COMPETENCY_PREREQUISITES,
  ROAS_COURSE,
  ROAS_LEARNING_PATH_STABLE_ID,
  ROAS_MISSIONS,
  ROAS_MODULES,
  buildRoasAuthoringPlan
} from "./roas-curriculum";
import {
  BootstrapEnvironmentError,
  ROAS_CURRICULUM_PHASE_KINDS,
  ROAS_LAB_PHASE_KINDS,
  buildRoasCurriculumBootstrapPlan,
  describeBootstrapPlan,
  looksLikeProductionTarget,
  requiredConfirmationFor,
  resolveBootstrapEnvironment,
  selectCurriculumPhaseOperations,
  selectLabPhaseOperations
} from "./roas-bootstrap";

const plan = buildRoasCurriculumBootstrapPlan();

/**
 * ROAS-4 — the bootstrap plan is a projection of ROAS-2, and the environment
 * guard fails closed.
 *
 * These assertions compare against the authored constants rather than against
 * literals. A test that hardcoded "router-on-a-stick" would keep passing while
 * the publisher drifted away from the reviewed curriculum.
 */
describe("ROAS-4 bootstrap plan is derived, never re-typed", () => {
  it("publishes the authored course under the authored learning path", () => {
    expect(plan.learningPath.stableId).toBe(ROAS_LEARNING_PATH_STABLE_ID);
    expect(plan.course.stableId).toBe(ROAS_COURSE.stableId);
    expect(plan.course.title).toBe(ROAS_COURSE.title);
    expect(plan.course.description).toBe(ROAS_COURSE.description);
    expect(plan.course.position).toBe(ROAS_COURSE.position);
    expect(plan.course.estimatedMinutes).toBe(ROAS_COURSE.estimatedMinutes);
  });

  it("carries every authored module verbatim", () => {
    expect(plan.modules).toHaveLength(ROAS_MODULES.length);
    expect(plan.modules).toHaveLength(4);

    for (const authored of ROAS_MODULES) {
      const projected = plan.modules.find(
        (module) => module.stableId === authored.stableId
      );
      expect(projected).toBeDefined();
      expect(projected!.title).toBe(authored.title);
      expect(projected!.description).toBe(authored.description);
      expect(projected!.position).toBe(authored.position);
      expect(projected!.estimatedMinutes).toBe(authored.estimatedMinutes);
    }
  });

  it("carries every authored mission, with the brief as its description", () => {
    expect(plan.missions).toHaveLength(ROAS_MISSIONS.length);
    expect(plan.missions).toHaveLength(7);

    for (const authored of ROAS_MISSIONS) {
      const projected = plan.missions.find(
        (mission) => mission.stableId === authored.stableId
      );
      expect(projected).toBeDefined();
      expect(projected!.title).toBe(authored.title);
      // The instructional brief is what the Search Engine projects and what the
      // learner reads; it must reach the database unaltered.
      expect(projected!.description).toBe(authored.brief);
      expect(projected!.moduleStableId).toBe(authored.moduleStableId);
      expect(projected!.estimatedMinutes).toBe(authored.estimatedMinutes);
    }
  });

  it("carries every authored competency with its domain-scoped identity", () => {
    expect(plan.competencies).toHaveLength(ROAS_COMPETENCIES.length);
    expect(plan.competencies).toHaveLength(9);

    for (const authored of ROAS_COMPETENCIES) {
      const projected = plan.competencies.find(
        (competency) => competency.stableId === authored.stableId
      );
      expect(projected).toBeDefined();
      expect(projected!.title).toBe(authored.title);
      expect(projected!.description).toBe(authored.description);
      // Connected learning depends on this: never course-scoped.
      expect(projected!.stableId.startsWith("net.")).toBe(true);
    }
  });

  it("carries the authored prerequisite edges unchanged", () => {
    expect(plan.competencyPrerequisites).toEqual(
      ROAS_COMPETENCY_PREREQUISITES.map((edge) => ({
        competencyStableId: edge.competencyStableId,
        prerequisiteCompetencyStableId: edge.prerequisiteCompetencyStableId
      }))
    );
  });

  it("carries every authored mission-competency link, required flag intact", () => {
    const authoredLinks = ROAS_MISSIONS.flatMap((mission) =>
      mission.competencies.map((link) => ({
        missionStableId: mission.stableId,
        competencyStableId: link.competencyStableId,
        required: link.required
      }))
    );

    expect(plan.missionCompetencyLinks).toEqual(authoredLinks);
  });

  it("gives every mission at least one required competency", () => {
    // Without this, validateLearningPathForPublication raises MISSING_COMPETENCY
    // and the publication would fail at the very last step.
    for (const mission of plan.missions) {
      const required = plan.missionCompetencyLinks.filter(
        (link) => link.missionStableId === mission.stableId && link.required
      );
      expect(required.length).toBeGreaterThan(0);
    }
  });

  it("attaches every mission to a module in the plan", () => {
    const moduleIds = new Set(plan.modules.map((module) => module.stableId));
    for (const mission of plan.missions) {
      expect(moduleIds.has(mission.moduleStableId)).toBe(true);
    }
  });

  it("links only competencies the plan actually creates", () => {
    const competencyIds = new Set(
      plan.competencies.map((competency) => competency.stableId)
    );
    for (const link of plan.missionCompetencyLinks) {
      expect(competencyIds.has(link.competencyStableId)).toBe(true);
    }
    for (const edge of plan.competencyPrerequisites) {
      expect(competencyIds.has(edge.competencyStableId)).toBe(true);
      expect(competencyIds.has(edge.prerequisiteCompetencyStableId)).toBe(true);
    }
  });

  it("carries positive effort metadata, which the quality report requires", () => {
    for (const mission of plan.missions) {
      expect(mission.estimatedMinutes).toBeGreaterThan(0);
    }
    for (const module of plan.modules) {
      expect(module.estimatedMinutes).toBeGreaterThan(0);
    }
  });

  it("summarises itself from the plan rather than from constants", () => {
    const summary = describeBootstrapPlan(plan);
    expect(summary).toContain(`${plan.modules.length} modules`);
    expect(summary).toContain(`${plan.missions.length} missions`);
    expect(summary).toContain(`${plan.competencies.length} competencies`);
  });
});

describe("ROAS-4 phase selection is derived from the authored plan", () => {
  const authoringPlan = buildRoasAuthoringPlan();

  it("splits the authored plan without losing or duplicating an operation", () => {
    const curriculum = selectCurriculumPhaseOperations(authoringPlan);
    const lab = selectLabPhaseOperations(authoringPlan);

    expect(curriculum.length + lab.length).toBe(authoringPlan.length);

    const covered = new Set([
      ...curriculum.map((operation) => operation.order),
      ...lab.map((operation) => operation.order)
    ]);
    expect(covered.size).toBe(authoringPlan.length);
  });

  it("classifies every authored operation kind into exactly one phase", () => {
    for (const operation of authoringPlan) {
      const inCurriculum = ROAS_CURRICULUM_PHASE_KINDS.includes(operation.kind);
      const inLab = ROAS_LAB_PHASE_KINDS.includes(operation.kind);
      expect(inCurriculum !== inLab).toBe(true);
    }
  });

  it("keeps the authored ordering within the curriculum phase", () => {
    const orders = selectCurriculumPhaseOperations(authoringPlan).map(
      (operation) => operation.order
    );
    expect(orders).toEqual([...orders].sort((a, b) => a - b));
  });

  it("publishes the curriculum before anything lab-related", () => {
    const curriculum = selectCurriculumPhaseOperations(authoringPlan);
    const lab = selectLabPhaseOperations(authoringPlan);
    const lastCurriculum = Math.max(...curriculum.map((o) => o.order));
    const firstLab = Math.min(...lab.map((o) => o.order));
    expect(lastCurriculum).toBeLessThan(firstLab);
  });

  it("defers every lab operation, because no provider implements the probes", () => {
    expect(plan.deferredOperations.length).toBeGreaterThan(0);
    for (const operation of plan.deferredOperations) {
      expect(ROAS_LAB_PHASE_KINDS).toContain(operation.kind);
    }
    for (const operation of plan.operations) {
      expect(ROAS_LAB_PHASE_KINDS).not.toContain(operation.kind);
    }
  });

  it("ends the curriculum phase by publishing the learning path", () => {
    const curriculum = selectCurriculumPhaseOperations(authoringPlan);
    expect(curriculum[curriculum.length - 1]!.kind).toBe(
      "publish_learning_path"
    );
  });

  it("names no operation that creates learner progress or evidence", () => {
    for (const operation of [...plan.operations, ...plan.deferredOperations]) {
      expect(operation.adminFunction).not.toMatch(
        /progress|evidence|competencyState|award/i
      );
    }
  });
});

describe("ROAS-4 environment guard fails closed", () => {
  const development = {
    appEnv: "development",
    supabaseUrl: "http://127.0.0.1:54321",
    hasServiceRoleKey: true
  };

  it("dry-runs when no confirmation is supplied", () => {
    const decision = resolveBootstrapEnvironment(development);
    expect(decision.mode).toBe("dry_run");
    expect(decision.targetUrl).toBeUndefined();
  });

  it("executes only when the confirmation names the target exactly", () => {
    const decision = resolveBootstrapEnvironment({
      ...development,
      confirmation: development.supabaseUrl
    });
    expect(decision.mode).toBe("execute");
    expect(decision.targetUrl).toBe(development.supabaseUrl);
  });

  it("REFUSES production unconditionally, confirmation or not", () => {
    expect(() =>
      resolveBootstrapEnvironment({
        appEnv: "production",
        supabaseUrl: "https://example.supabase.co",
        confirmation: "https://example.supabase.co",
        hasServiceRoleKey: true
      })
    ).toThrow(BootstrapEnvironmentError);
  });

  it("refuses an unset or unrecognised APP_ENV rather than assuming", () => {
    for (const appEnv of [undefined, "", "staging", "uat", "dev", "DEVELOPMENT"]) {
      expect(() =>
        resolveBootstrapEnvironment({
          ...(appEnv === undefined ? {} : { appEnv }),
          supabaseUrl: development.supabaseUrl,
          hasServiceRoleKey: true
        })
      ).toThrow(BootstrapEnvironmentError);
    }
  });

  it("refuses when the target project cannot be identified", () => {
    expect(() =>
      resolveBootstrapEnvironment({
        appEnv: "development",
        hasServiceRoleKey: true
      })
    ).toThrow(/SUPABASE_URL/);
  });

  it("refuses a production-looking host even when APP_ENV says development", () => {
    for (const url of [
      "https://prod-db.supabase.co",
      "https://production.example.com",
      "https://live.example.com",
      "https://www.example.com"
    ]) {
      expect(() =>
        resolveBootstrapEnvironment({
          appEnv: "development",
          supabaseUrl: url,
          confirmation: url,
          hasServiceRoleKey: true
        })
      ).toThrow(BootstrapEnvironmentError);
    }
  });

  it("refuses a confirmation that does not match the target", () => {
    expect(() =>
      resolveBootstrapEnvironment({
        ...development,
        confirmation: "http://127.0.0.1:54322"
      })
    ).toThrow(/does not match/i);

    expect(() =>
      resolveBootstrapEnvironment({
        ...development,
        confirmation: "yes"
      })
    ).toThrow(/does not match/i);
  });

  it("refuses to execute without a service-role credential", () => {
    expect(() =>
      resolveBootstrapEnvironment({
        ...development,
        hasServiceRoleKey: false,
        confirmation: development.supabaseUrl
      })
    ).toThrow(/SERVICE_ROLE/);
  });

  it("still dry-runs without a service-role credential", () => {
    // Seeing the plan must never require holding the key that could write.
    expect(
      resolveBootstrapEnvironment({ ...development, hasServiceRoleKey: false })
        .mode
    ).toBe("dry_run");
  });

  it("accepts the test environment as a valid non-production target", () => {
    expect(
      resolveBootstrapEnvironment({ ...development, appEnv: "test" }).mode
    ).toBe("dry_run");
  });

  it("tolerates surrounding whitespace without loosening the match", () => {
    expect(
      resolveBootstrapEnvironment({
        appEnv: " development ",
        supabaseUrl: " http://127.0.0.1:54321 ",
        confirmation: " http://127.0.0.1:54321 ",
        hasServiceRoleKey: true
      }).mode
    ).toBe("execute");
  });

  it("requires the confirmation to be the URL itself", () => {
    expect(requiredConfirmationFor(" http://127.0.0.1:54321 ")).toBe(
      "http://127.0.0.1:54321"
    );
  });

  it("treats a local target as non-production", () => {
    for (const url of [
      "http://localhost:54321",
      "http://127.0.0.1:54321",
      "http://supabase.local:8000"
    ]) {
      expect(looksLikeProductionTarget(url)).toBe(false);
    }
  });
});
