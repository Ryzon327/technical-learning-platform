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
  type ServiceRoleCredentialProblem,
  buildRoasCurriculumBootstrapPlan,
  classifyServiceRoleCredential,
  describeBootstrapPlan,
  describeBootstrapTarget,
  describeServiceRoleCredentialProblem,
  isValidAuthoringActorId,
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

  /**
   * DB-SERVICE-ROLE-1 — 31 is the authored truth.
   *
   * ROAS-4's pull request description claimed "all 30 mission-competency
   * links". That prose was wrong when it was written: `roas-curriculum.ts` has
   * exactly one commit and has never been modified, and its seven missions
   * carry 4 + 3 + 2 + 4 + 3 + 6 + 9 = 31 competency assignments.
   *
   * Both halves are asserted deliberately. The literal catches an unintended
   * link being added or lost; the per-mission derivation is what makes the
   * literal meaningful rather than a number someone can update to match a
   * mistake. A future edit has to change the authored curriculum AND this
   * accounting together, which is the point.
   */
  it("carries exactly 31 mission-competency links, per authored mission", () => {
    const perMission = ROAS_MISSIONS.map(
      (mission) => mission.competencies.length
    );

    expect(perMission).toEqual([4, 3, 2, 4, 3, 6, 9]);
    expect(perMission.reduce((total, count) => total + count, 0)).toBe(31);
    expect(plan.missionCompetencyLinks).toHaveLength(31);
    expect(describeBootstrapPlan(plan)).toContain(
      "31 mission-competency links"
    );
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

/**
 * A syntactically valid, obviously synthetic JWT.
 *
 * Built rather than pasted so no fixture in this repository can ever resemble a
 * real credential. The signature segment is a literal, and nothing verifies it —
 * `classifyServiceRoleCredential` reads the `role` claim and nothing else.
 */
function syntheticJwt(payload: Record<string, unknown>): string {
  const encode = (value: object) =>
    btoa(JSON.stringify(value))
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

  return [
    encode({ alg: "HS256", typ: "JWT" }),
    encode(payload),
    "not-a-real-signature"
  ].join(".");
}

const SYNTHETIC_SERVICE_ROLE_KEY = syntheticJwt({ role: "service_role" });
const SYNTHETIC_ANON_KEY = syntheticJwt({ role: "anon" });
const SYNTHETIC_ACTOR_ID = "3f2504e0-4f89-11d3-9a0c-0305e82c3301";

describe("ROAS-4 environment guard fails closed", () => {
  const development = {
    appEnv: "development",
    supabaseUrl: "http://127.0.0.1:54321",
    serviceRoleKey: SYNTHETIC_SERVICE_ROLE_KEY,
    actorUserId: SYNTHETIC_ACTOR_ID
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
        serviceRoleKey: SYNTHETIC_SERVICE_ROLE_KEY,
        actorUserId: SYNTHETIC_ACTOR_ID
      })
    ).toThrow(BootstrapEnvironmentError);
  });

  it("refuses an unset or unrecognised APP_ENV rather than assuming", () => {
    for (const appEnv of [undefined, "", "staging", "uat", "dev", "DEVELOPMENT"]) {
      expect(() =>
        resolveBootstrapEnvironment({
          ...(appEnv === undefined ? {} : { appEnv }),
          supabaseUrl: development.supabaseUrl,
          serviceRoleKey: SYNTHETIC_SERVICE_ROLE_KEY,
          actorUserId: SYNTHETIC_ACTOR_ID
        })
      ).toThrow(BootstrapEnvironmentError);
    }
  });

  it("refuses when the target project cannot be identified", () => {
    expect(() =>
      resolveBootstrapEnvironment({
        appEnv: "development",
        serviceRoleKey: SYNTHETIC_SERVICE_ROLE_KEY,
        actorUserId: SYNTHETIC_ACTOR_ID
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
          serviceRoleKey: SYNTHETIC_SERVICE_ROLE_KEY,
          actorUserId: SYNTHETIC_ACTOR_ID
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
        serviceRoleKey: undefined,
        confirmation: development.supabaseUrl
      })
    ).toThrow(/SERVICE_ROLE/);
  });

  it("still dry-runs without a service-role credential", () => {
    // Seeing the plan must never require holding the key that could write.
    expect(
      resolveBootstrapEnvironment({ ...development, serviceRoleKey: undefined })
        .mode
    ).toBe("dry_run");
  });

  it("still dry-runs without an actor id, for the same reason", () => {
    expect(
      resolveBootstrapEnvironment({ ...development, actorUserId: undefined })
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
        serviceRoleKey: SYNTHETIC_SERVICE_ROLE_KEY,
        actorUserId: SYNTHETIC_ACTOR_ID
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

/**
 * DB-SERVICE-ROLE-1 — the credential must be a service-role credential.
 *
 * The guard previously proved only that `SUPABASE_SERVICE_ROLE_KEY` was
 * non-empty. That is the same presence-not-validity defect that produced the
 * `SUPABASE_URL` 500: a wrong value passes a truthiness check and fails later as
 * something unrecognisable. Pasting the anon key here is the specific mistake
 * worth catching, because `anon` is granted nothing by DB-RLS-1 and would fail
 * with the *same* 42501 this package exists to fix.
 */
describe("DB-SERVICE-ROLE-1 service-role credential classification", () => {
  it("accepts a legacy JWT whose role claim is service_role", () => {
    const verdict = classifyServiceRoleCredential(SYNTHETIC_SERVICE_ROLE_KEY);
    expect(verdict).toEqual({ usable: true, format: "legacy_jwt" });
  });

  it("accepts a current-generation sb_secret_ key", () => {
    expect(classifyServiceRoleCredential("sb_secret_abc123")).toEqual({
      usable: true,
      format: "secret_key"
    });
  });

  it("REFUSES the anon key, the most likely wrong paste", () => {
    const verdict = classifyServiceRoleCredential(SYNTHETIC_ANON_KEY);
    expect(verdict).toEqual({ usable: false, problem: "anon_role" });
  });

  it("REFUSES a publishable browser key", () => {
    expect(classifyServiceRoleCredential("sb_publishable_abc123")).toEqual({
      usable: false,
      problem: "publishable_key"
    });
  });

  it("refuses any other role claim rather than guessing", () => {
    for (const role of ["authenticated", "postgres", "supabase_admin", ""]) {
      const verdict = classifyServiceRoleCredential(syntheticJwt({ role }));
      expect(verdict.usable).toBe(false);
    }
  });

  it("refuses a JWT whose payload cannot be read", () => {
    expect(classifyServiceRoleCredential("eyJhbGc.@@@not-base64@@@.sig")).toEqual(
      { usable: false, problem: "unreadable_jwt" }
    );
  });

  it("refuses a JWT carrying no role claim at all", () => {
    expect(classifyServiceRoleCredential(syntheticJwt({ sub: "x" }))).toEqual({
      usable: false,
      problem: "unreadable_jwt"
    });
  });

  it("refuses absent, empty and whitespace credentials", () => {
    for (const value of [undefined, "", "   "]) {
      expect(classifyServiceRoleCredential(value)).toEqual({
        usable: false,
        problem: "absent"
      });
    }
  });

  it("FAILS CLOSED on an unrecognised format rather than assuming it is new", () => {
    for (const value of ["hunter2", "sb_", "a.b", "a.b.c.d", "sbsecret_x"]) {
      expect(classifyServiceRoleCredential(value).usable).toBe(false);
    }
  });

  // The security property that matters most: no refusal may echo the value.
  it("NEVER includes any part of the credential in a refusal message", () => {
    const problems: ServiceRoleCredentialProblem[] = [
      "absent",
      "publishable_key",
      "anon_role",
      "wrong_role",
      "unreadable_jwt",
      "unrecognised_format"
    ];

    for (const problem of problems) {
      const message = describeServiceRoleCredentialProblem(problem);
      expect(message).not.toContain(SYNTHETIC_SERVICE_ROLE_KEY);
      expect(message).not.toContain(SYNTHETIC_ANON_KEY);
      expect(message).not.toMatch(/eyJ/);
      expect(message).not.toMatch(/sb_secret_\w/);
      expect(message).not.toMatch(/sb_publishable_\w/);
      // Every message is a constant, so it cannot carry a runtime value.
      expect(message.length).toBeGreaterThan(0);
    }
  });

  it("refuses execution when the key is the anon key, naming no value", () => {
    let thrown: unknown;
    try {
      resolveBootstrapEnvironment({
        appEnv: "development",
        supabaseUrl: "http://127.0.0.1:54321",
        confirmation: "http://127.0.0.1:54321",
        serviceRoleKey: SYNTHETIC_ANON_KEY,
        actorUserId: SYNTHETIC_ACTOR_ID
      });
    } catch (error) {
      thrown = error;
    }

    expect(thrown).toBeInstanceOf(BootstrapEnvironmentError);
    expect((thrown as Error).message).not.toContain(SYNTHETIC_ANON_KEY);
    expect((thrown as Error).message).not.toMatch(/eyJ/);
  });
});

/**
 * DB-SERVICE-ROLE-1 — the audit trail requires a real account.
 *
 * `curriculum_publication_events.actor_user_id` is
 * `uuid not null references auth.users(id)`. The command used to default to the
 * literal `"roas4-uat-bootstrap"`, which is not castable to `uuid` — a
 * guaranteed 22P02 at the FINAL step of publication, after every node had been
 * written and with no transaction to undo them.
 */
describe("DB-SERVICE-ROLE-1 authoring actor identity", () => {
  it("accepts a UUID", () => {
    expect(isValidAuthoringActorId(SYNTHETIC_ACTOR_ID)).toBe(true);
    expect(isValidAuthoringActorId(` ${SYNTHETIC_ACTOR_ID} `)).toBe(true);
  });

  it("REJECTS the removed literal that could never have been inserted", () => {
    expect(isValidAuthoringActorId("roas4-uat-bootstrap")).toBe(false);
  });

  it("rejects absent and malformed identifiers", () => {
    for (const value of [
      undefined,
      "",
      "   ",
      "not-a-uuid",
      "3f2504e0-4f89-11d3-9a0c",
      "3f2504e04f8911d39a0c0305e82c3301",
      "zzzzzzzz-4f89-11d3-9a0c-0305e82c3301"
    ]) {
      expect(isValidAuthoringActorId(value)).toBe(false);
    }
  });

  it("refuses to execute without a valid actor, BEFORE any write", () => {
    expect(() =>
      resolveBootstrapEnvironment({
        appEnv: "development",
        supabaseUrl: "http://127.0.0.1:54321",
        confirmation: "http://127.0.0.1:54321",
        serviceRoleKey: SYNTHETIC_SERVICE_ROLE_KEY,
        actorUserId: "roas4-uat-bootstrap"
      })
    ).toThrow(/TLP_UAT_BOOTSTRAP_ACTOR_ID/);
  });

  it("returns the validated actor on the decision", () => {
    const decision = resolveBootstrapEnvironment({
      appEnv: "development",
      supabaseUrl: "http://127.0.0.1:54321",
      confirmation: "http://127.0.0.1:54321",
      serviceRoleKey: SYNTHETIC_SERVICE_ROLE_KEY,
      actorUserId: ` ${SYNTHETIC_ACTOR_ID} `
    });

    expect(decision.actorUserId).toBe(SYNTHETIC_ACTOR_ID);
  });
});

/**
 * DB-SERVICE-ROLE-1 — the command must not republish the project address.
 */
describe("DB-SERVICE-ROLE-1 safe target description", () => {
  it("does not contain the full project URL", () => {
    const url = "https://abcdefghijklmnop.supabase.co";
    const description = describeBootstrapTarget("development", url);

    expect(description).not.toContain(url);
    expect(description).not.toContain("abcdefghijklmnop");
    expect(description).not.toContain(".supabase.co");
  });

  it("still proves which environment was resolved", () => {
    expect(describeBootstrapTarget("development", "http://localhost:54321")).toContain(
      "development"
    );
    expect(describeBootstrapTarget("test", "http://localhost:54321")).toContain(
      "test"
    );
  });

  it("shows a local stack in full, because it names no project", () => {
    expect(describeBootstrapTarget("development", "http://localhost:54321")).toContain(
      "localhost"
    );
    expect(describeBootstrapTarget("development", "http://127.0.0.1:54321")).toContain(
      "127.0.0.1"
    );
  });

  it("reports an unparseable URL as such rather than echoing it", () => {
    const description = describeBootstrapTarget("development", "not a url");
    expect(description).toContain("unrecognised host");
    expect(description).not.toContain("not a url");
  });

  it("the execute decision carries the safe description", () => {
    const decision = resolveBootstrapEnvironment({
      appEnv: "development",
      supabaseUrl: "http://127.0.0.1:54321",
      confirmation: "http://127.0.0.1:54321",
      serviceRoleKey: SYNTHETIC_SERVICE_ROLE_KEY,
      actorUserId: SYNTHETIC_ACTOR_ID
    });

    expect(decision.targetDescription).toBeDefined();
    // The reason is printed; it must not carry the full URL either.
    expect(decision.reason).not.toContain("http://127.0.0.1:54321");
  });
});
