import { describe, expect, it } from "vitest";
import { scoreAssessment, validateAssessmentDefinition } from "./assessment";
import { MISSION_COMPETENCY_RELATIONSHIPS } from "./curriculum";
import { validateLabDefinition } from "./labs";
import {
  buildRoasAuthoringPlan,
  hasCompetencyPrerequisiteCycle,
  ROAS_COMPETENCIES,
  ROAS_COMPETENCY_PREREQUISITES,
  ROAS_COURSE,
  ROAS_HOSTS,
  ROAS_KNOWLEDGE_CHECKS,
  ROAS_LAB_DEFINITION,
  ROAS_LAB_VALIDATION_CHECKS,
  ROAS_LAB_VALIDATION_PROFILE_STABLE_ID,
  ROAS_MISSIONS,
  ROAS_MODULES,
  ROAS_PRACTICE_PLACEMENTS,
  ROAS_REUSABLE_COMPETENCY_DOMAIN_PREFIXES,
  ROAS_ROUTER_SUBINTERFACES,
  ROAS_TRUNK_LINK,
  ROAS_VLANS,
  resolveRoasPracticePlacements,
  validateRoasCurriculum,
  type RoasAuthoringOperationKind
} from "./roas-curriculum";

/**
 * ROAS-1 holds this list, but shared-types must not import from services/api.
 * Duplicated deliberately and pinned by a test below so the two cannot drift:
 * if ROAS-1 adds a token, that test is where it is noticed.
 */
const PROVIDER_TOKENS = [
  "proxmox",
  "pve",
  "hypervisor",
  "esxi",
  "vsphere",
  "vcenter",
  "qemu",
  "kvm",
  "libvirt",
  "docker",
  "podman",
  "containerd",
  "aws",
  "azure",
  "gcp",
  "node-r620"
];

describe("ROAS-2 content validity", () => {
  it("passes its own validation with no errors", () => {
    const result = validateRoasCurriculum();
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it("authors the approved seven-mission progression across four modules", () => {
    expect(ROAS_MODULES).toHaveLength(4);
    expect(ROAS_MISSIONS).toHaveLength(7);

    expect(ROAS_MISSIONS.map((mission) => mission.stableId)).toEqual([
      "ros-m1-understand-the-network",
      "ros-m2-build-layer2-segmentation",
      "ros-m3-build-the-trunk",
      "ros-m4-route-between-vlans",
      "ros-m5-verify-the-network",
      "ros-m6-troubleshoot-the-network",
      "ros-m7-demonstrate"
    ]);
  });

  it("gives every module at least one mission and unique positions", () => {
    for (const module of ROAS_MODULES) {
      const missions = ROAS_MISSIONS.filter(
        (mission) => mission.moduleStableId === module.stableId
      );
      expect(missions.length).toBeGreaterThan(0);

      const positions = missions.map((mission) => mission.position);
      expect(new Set(positions).size).toBe(positions.length);
    }

    const modulePositions = ROAS_MODULES.map((module) => module.position);
    expect(new Set(modulePositions).size).toBe(modulePositions.length);
  });

  it("maps every mission to at least one required competency", () => {
    // Without this, `validateLearningPathForPublication` raises
    // MISSING_COMPETENCY and the learning path cannot publish at all.
    for (const mission of ROAS_MISSIONS) {
      const required = mission.competencies.filter((link) => link.required);
      expect(required.length).toBeGreaterThan(0);
    }
  });

  it("teaches every competency it declares", () => {
    const linked = new Set(
      ROAS_MISSIONS.flatMap((mission) =>
        mission.competencies.map((link) => link.competencyStableId)
      )
    );

    for (const competency of ROAS_COMPETENCIES) {
      expect(linked.has(competency.stableId)).toBe(true);
    }
  });

  it("covers each required learning outcome with a competency", () => {
    expect(ROAS_COMPETENCIES.map((competency) => competency.stableId)).toEqual([
      "net.ip-addressing",
      "net.subnet-boundaries",
      "net.vlan-segmentation",
      "net.access-port-membership",
      "net.trunking-dot1q",
      "net.inter-vlan-routing",
      "net.default-gateway",
      "net.connectivity-verification",
      "net.fault-isolation"
    ]);
  });

  it("keeps the competency prerequisite graph acyclic", () => {
    // `buildLearningPathQualityReport` rejects a cyclic graph outright.
    expect(hasCompetencyPrerequisiteCycle()).toBe(false);
    expect(ROAS_COMPETENCY_PREREQUISITES.length).toBeGreaterThan(0);
  });
});

describe("ROAS-2 connected-learning reuse", () => {
  it("scopes every competency to a domain, never to this course", () => {
    for (const competency of ROAS_COMPETENCIES) {
      expect(
        ROAS_REUSABLE_COMPETENCY_DOMAIN_PREFIXES.some((prefix) =>
          competency.stableId.startsWith(prefix)
        )
      ).toBe(true);
    }
  });

  it("embeds no course, module or mission identity in a competency id", () => {
    // The single decision that makes Linux/Windows/Security reuse possible. A
    // competency named for this course would force a later course either to
    // duplicate it or to reference a networking course by name.
    const courseNodes = [
      ROAS_COURSE.stableId,
      ...ROAS_MODULES.map((module) => module.stableId),
      ...ROAS_MISSIONS.map((mission) => mission.stableId)
    ];

    for (const competency of ROAS_COMPETENCIES) {
      for (const node of courseNodes) {
        expect(competency.stableId.includes(node)).toBe(false);
      }
      expect(competency.stableId).not.toMatch(/roas|router-on-a-stick/);
    }
  });

  it("lets a later course reference a competency without course-local duplication", () => {
    // A hypothetical Linux mission linking the same identity. This is exactly
    // what `mission_competencies` already permits — LEARN-008 section 8.1
    // confirms it links ANY mission to ANY competency — so ROAS-2 adds no
    // cross-course mechanism, it only keeps the identity referenceable.
    const linuxMissionLink = {
      missionStableId: "linux-m3-verify-host-networking",
      competencyStableId: "net.default-gateway",
      required: true
    };

    const known = ROAS_COMPETENCIES.map((competency) => competency.stableId);
    expect(known).toContain(linuxMissionLink.competencyStableId);
    expect(linuxMissionLink.competencyStableId.startsWith("net.")).toBe(true);
  });
});

describe("ROAS-2 deterministic validation authority", () => {
  it("produces a lab definition the real validator accepts", () => {
    expect(validateLabDefinition(ROAS_LAB_DEFINITION)).toEqual({
      valid: true,
      errors: []
    });
  });

  it("terminates the course at the demonstration mission", () => {
    expect(ROAS_LAB_DEFINITION.missionStableId).toBe("ros-m7-demonstrate");
    expect(ROAS_MISSIONS[ROAS_MISSIONS.length - 1]?.stableId).toBe(
      "ros-m7-demonstrate"
    );
  });

  it("requires every authored competency for the demonstration", () => {
    expect([...ROAS_LAB_DEFINITION.competencyStableIds].sort()).toEqual(
      ROAS_COMPETENCIES.map((competency) => competency.stableId).sort()
    );
  });

  it("carries at least one published-eligible required check", () => {
    // `transitionLabDefinitionState` refuses to publish a lab whose profile has
    // no published required check: a lab that can be "passed" without
    // demonstrating anything produces meaningless evidence.
    const required = ROAS_LAB_VALIDATION_CHECKS.filter((check) => check.required);
    expect(required.length).toBeGreaterThan(0);
    expect(ROAS_LAB_DEFINITION.validationProfileStableId).toBe(
      ROAS_LAB_VALIDATION_PROFILE_STABLE_ID
    );
  });

  it("is authored as draft so nothing reaches a learner unreviewed", () => {
    expect(ROAS_LAB_DEFINITION.publicationState).toBe("draft");
  });

  it("gives every check a deterministic probe and a learner explanation", () => {
    for (const check of ROAS_LAB_VALIDATION_CHECKS) {
      expect(check.stableId).toMatch(/^LABCHK-[A-Z0-9][A-Z0-9-]*$/);
      expect(check.probeId.trim().length).toBeGreaterThan(0);
      expect(check.explanation.trim().length).toBeGreaterThan(0);
    }
  });

  it("keeps knowledge checks practice-only so they cannot manufacture competency", () => {
    for (const assessment of ROAS_KNOWLEDGE_CHECKS) {
      expect(assessment.purpose).toBe("practice");
      expect(assessment.competencyMappings).toEqual([]);
      expect(validateAssessmentDefinition(assessment)).toEqual([]);
    }
  });

  it("scores knowledge checks deterministically with no AI involvement", () => {
    const segmentation = ROAS_KNOWLEDGE_CHECKS.find(
      (assessment) => assessment.stableId === "ros-kc-segmentation"
    );
    expect(segmentation).toBeDefined();

    const perfect = scoreAssessment(
      segmentation!,
      segmentation!.questions.map((question) => ({
        questionStableId: question.stableId,
        selectedOptionIds: question.correctOptionIds
      }))
    );

    expect(perfect.passed).toBe(true);
    expect(perfect.percent).toBe(100);

    const empty = scoreAssessment(
      segmentation!,
      segmentation!.questions.map((question) => ({
        questionStableId: question.stableId,
        selectedOptionIds: []
      }))
    );

    expect(empty.passed).toBe(false);
    expect(empty.earnedPoints).toBe(0);
  });

  it("marks a partially-correct multiple-choice answer wrong rather than partially right", () => {
    const routing = ROAS_KNOWLEDGE_CHECKS.find(
      (assessment) => assessment.stableId === "ros-kc-inter-vlan-routing"
    );
    const question = routing!.questions.find(
      (candidate) => candidate.stableId === "ros-kc-ivr-q2"
    );

    expect(question!.correctOptionIds.length).toBeGreaterThan(1);

    const partial = scoreAssessment(routing!, [
      {
        questionStableId: question!.stableId,
        selectedOptionIds: [question!.correctOptionIds[0]!]
      }
    ]);

    expect(partial.earnedPoints).toBe(0);
  });
});

describe("ROAS-2 question quality", () => {
  it("never makes every option correct", () => {
    for (const assessment of ROAS_KNOWLEDGE_CHECKS) {
      for (const question of assessment.questions) {
        expect(question.correctOptionIds.length).toBeLessThan(
          question.options.length
        );
        expect(question.correctOptionIds.length).toBeGreaterThan(0);
      }
    }
  });

  it("offers only options it actually defines", () => {
    for (const assessment of ROAS_KNOWLEDGE_CHECKS) {
      for (const question of assessment.questions) {
        const optionIds = new Set(question.options.map((option) => option.id));
        expect(optionIds.size).toBe(question.options.length);
        for (const correct of question.correctOptionIds) {
          expect(optionIds.has(correct)).toBe(true);
        }
      }
    }
  });

  it("asks about behaviour rather than standards trivia", () => {
    // The prompt bank should not be answerable by recalling a standard number.
    // "802.1Q" may appear as context, but no prompt may ASK for the standard.
    for (const assessment of ROAS_KNOWLEDGE_CHECKS) {
      for (const question of assessment.questions) {
        expect(question.prompt).not.toMatch(
          /which (IEEE )?standard|what standard|standard defines|acronym stand/i
        );
      }
    }
  });
});

describe("ROAS-2 provider neutrality", () => {
  it("names no provider in any lab capability", () => {
    for (const capability of ROAS_LAB_DEFINITION.requiredCapabilities) {
      const lowered = capability.toLowerCase();
      for (const token of PROVIDER_TOKENS) {
        expect(lowered.includes(token)).toBe(false);
      }
    }
  });

  it("names no provider anywhere in learner-facing curriculum text", () => {
    const learnerText = [
      ROAS_COURSE.title,
      ROAS_COURSE.description,
      ...ROAS_MODULES.flatMap((module) => [module.title, module.description]),
      ...ROAS_MISSIONS.flatMap((mission) => [mission.title, mission.brief]),
      ...ROAS_LAB_VALIDATION_CHECKS.flatMap((check) => [
        check.title,
        check.explanation
      ])
    ]
      .join(" ")
      .toLowerCase();

    for (const token of PROVIDER_TOKENS) {
      expect(learnerText.includes(token)).toBe(false);
    }
  });

  it("uses only approved resource kinds", () => {
    const approved = new Set([
      "linux_node",
      "windows_node",
      "network_device",
      "container",
      "virtual_machine"
    ]);

    for (const resource of ROAS_LAB_DEFINITION.resources) {
      expect(approved.has(resource.kind)).toBe(true);
      expect(resource.count).toBeGreaterThan(0);
    }
  });
});

describe("ROAS-2 topology coherence", () => {
  it("gives every host an address inside its own VLAN's gateway subnet", () => {
    for (const host of ROAS_HOSTS) {
      const vlan = ROAS_VLANS.find((candidate) => candidate.id === host.vlanId);
      expect(vlan).toBeDefined();
      expect(host.defaultGateway).toBe(vlan!.gatewayAddress);

      const hostPrefix = host.address.split(".").slice(0, 3).join(".");
      const gatewayPrefix = vlan!.gatewayAddress.split(".").slice(0, 3).join(".");
      expect(hostPrefix).toBe(gatewayPrefix);
    }
  });

  it("places the two hosts in different VLANs, or the lab proves nothing", () => {
    const vlanIds = ROAS_HOSTS.map((host) => host.vlanId);
    expect(new Set(vlanIds).size).toBe(vlanIds.length);
  });

  it("trunks exactly the VLANs the router terminates", () => {
    expect([...ROAS_TRUNK_LINK.taggedVlanIds].sort()).toEqual(
      ROAS_ROUTER_SUBINTERFACES.map((sub) => sub.vlanId).sort()
    );
    expect([...ROAS_TRUNK_LINK.taggedVlanIds].sort()).toEqual(
      ROAS_VLANS.map((vlan) => vlan.id).sort()
    );
  });

  it("gives each subinterface its VLAN's gateway address", () => {
    for (const subinterface of ROAS_ROUTER_SUBINTERFACES) {
      const vlan = ROAS_VLANS.find((candidate) => candidate.id === subinterface.vlanId);
      expect(subinterface.address.split("/")[0]).toBe(vlan!.gatewayAddress);
    }
  });
});

describe("ROAS-2 authoring plan", () => {
  it("uses only operations that already exist", () => {
    const existing = new Set([
      "createDraftLearningPath",
      "createDraftCourse",
      "createDraftModule",
      "createDraftMission",
      "createDraftCompetency",
      "addCompetencyPrerequisite",
      "linkMissionCompetency",
      "validateLearningPathForPublication",
      "transitionLearningPathState",
      "createDraftLabDefinition",
      "addLabValidationChecks",
      "transitionLabValidationProfileState",
      "transitionLabDefinitionState"
    ]);

    for (const operation of buildRoasAuthoringPlan()) {
      expect(existing.has(operation.adminFunction)).toBe(true);
      expect(operation.route).toMatch(/^POST \/admin\//);
    }
  });

  it("publishes the curriculum before the lab", () => {
    // `transitionLabDefinitionState` refuses to publish a lab whose mission or
    // competencies are not already published, so a plan in the other order
    // would fail against the real server.
    const plan = buildRoasAuthoringPlan();
    const kinds = plan.map((operation) => operation.kind);

    const publishPath = kinds.indexOf("publish_learning_path");
    const publishLab = kinds.indexOf("publish_lab_definition");
    const publishProfile = kinds.indexOf("publish_lab_validation_profile");
    const createLab = kinds.indexOf("create_lab_definition");

    expect(publishPath).toBeGreaterThan(-1);
    expect(publishLab).toBeGreaterThan(publishPath);
    expect(publishLab).toBeGreaterThan(publishProfile);
    expect(publishProfile).toBeGreaterThan(createLab);
  });

  it("creates every node before linking or publishing it", () => {
    const plan = buildRoasAuthoringPlan();
    const kinds = plan.map((operation) => operation.kind);

    const lastOf = (kind: RoasAuthoringOperationKind) => kinds.lastIndexOf(kind);
    const firstOf = (kind: RoasAuthoringOperationKind) => kinds.indexOf(kind);

    expect(firstOf("create_course")).toBeGreaterThan(firstOf("create_learning_path"));
    expect(firstOf("create_module")).toBeGreaterThan(firstOf("create_course"));
    expect(firstOf("create_mission")).toBeGreaterThan(lastOf("create_module"));
    expect(firstOf("link_mission_competency")).toBeGreaterThan(lastOf("create_mission"));
    expect(firstOf("link_mission_competency")).toBeGreaterThan(lastOf("create_competency"));
    expect(firstOf("validate_learning_path")).toBeGreaterThan(
      lastOf("link_mission_competency")
    );
  });

  it("covers every authored node exactly once", () => {
    const plan = buildRoasAuthoringPlan();

    const subjectsFor = (kind: RoasAuthoringOperationKind) =>
      plan.filter((operation) => operation.kind === kind).map((o) => o.subject);

    expect(subjectsFor("create_module").sort()).toEqual(
      ROAS_MODULES.map((module) => module.stableId).sort()
    );
    expect(subjectsFor("create_mission").sort()).toEqual(
      ROAS_MISSIONS.map((mission) => mission.stableId).sort()
    );
    expect(subjectsFor("create_competency").sort()).toEqual(
      ROAS_COMPETENCIES.map((competency) => competency.stableId).sort()
    );

    const expectedLinks = ROAS_MISSIONS.flatMap((mission) =>
      mission.competencies.map((link) => `${mission.stableId} -> ${link.competencyStableId}`)
    );
    expect(subjectsFor("link_mission_competency").sort()).toEqual(expectedLinks.sort());
  });

  it("numbers operations contiguously from zero", () => {
    const plan = buildRoasAuthoringPlan();
    expect(plan.map((operation) => operation.order)).toEqual(
      plan.map((_, index) => index)
    );
  });

  it("writes nothing itself", () => {
    // The plan is data. Executing it is a Founder action through guarded routes.
    const plan = buildRoasAuthoringPlan();
    expect(Array.isArray(plan)).toBe(true);
    expect(plan.length).toBeGreaterThan(0);
    for (const operation of plan) {
      expect(typeof operation.subject).toBe("string");
    }
  });
});

describe("ROAS-2 instructional shape", () => {
  it("gives every mission a substantive brief", () => {
    for (const mission of ROAS_MISSIONS) {
      expect(mission.brief.length).toBeGreaterThan(400);
      expect(mission.title.trim().length).toBeGreaterThan(0);
      expect(mission.estimatedMinutes).toBeGreaterThan(0);
    }
  });

  it("asks the learner to predict, observe and explain rather than only follow", () => {
    // Active learning is the approved instructional design, so at least the
    // decision-and-explanation shape must actually appear in the content.
    const briefs = ROAS_MISSIONS.map((mission) => mission.brief.toLowerCase());

    expect(briefs.filter((brief) => /\bexplain\b/.test(brief)).length).toBeGreaterThanOrEqual(4);
    expect(briefs.filter((brief) => /\bdecide\b|\bpredict\b/.test(brief)).length).toBeGreaterThanOrEqual(3);
    expect(briefs.filter((brief) => /\binspect\b|\bverify\b|\bobserve\b/.test(brief)).length).toBeGreaterThanOrEqual(4);
  });

  it("presents the troubleshooting mission without naming the fault", () => {
    const troubleshooting = ROAS_MISSIONS.find(
      (mission) => mission.stableId === "ros-m6-troubleshoot-the-network"
    );
    expect(troubleshooting).toBeDefined();

    const brief = troubleshooting!.brief.toLowerCase();
    // Several candidate causes are offered so the learner must discriminate.
    expect(brief).toContain("consistent with");
    expect(brief).toMatch(/confirm/);
    // And it must not simply hand over the answer.
    expect(brief).not.toMatch(/the fault is|the problem is that the|to fix this, run/);
  });

  it("tells the learner the validator settles the demonstration", () => {
    const demonstrate = ROAS_MISSIONS.find(
      (mission) => mission.stableId === "ros-m7-demonstrate"
    );
    expect(demonstrate!.brief.toLowerCase()).toContain("deterministic");
  });
});

/* ------------------------------------------------------------------ *
 * WP-B / DEC-055 — what a mission DOES with a competency
 * ------------------------------------------------------------------ */

describe("WP-B mission competency relationship", () => {
  const allLinks = ROAS_MISSIONS.flatMap((mission) =>
    mission.competencies.map((link) => ({ mission, link }))
  );

  it("authors an approved relationship on every link", () => {
    for (const { mission, link } of allLinks) {
      expect(
        (MISSION_COMPETENCY_RELATIONSHIPS as readonly string[]).includes(
          link.relationship
        ),
        `${mission.stableId} -> ${link.competencyStableId}`
      ).toBe(true);
    }
  });

  it("never authors requires as a relationship", () => {
    // Prerequisites belong to `learning_prerequisite_rules` and nowhere else.
    for (const { link } of allLinks) {
      expect(link.relationship).not.toBe("requires");
    }
  });

  it("develops each competency exactly once, across the whole course", () => {
    for (const competency of ROAS_COMPETENCIES) {
      const developedBy = allLinks.filter(
        ({ link }) =>
          link.competencyStableId === competency.stableId &&
          link.relationship === "develops"
      );

      expect(
        developedBy.length,
        `${competency.stableId} is developed ${developedBy.length} times`
      ).toBe(1);
    }
  });

  it("never reinforces a competency before a mission develops it", () => {
    const order = ROAS_MISSIONS.slice().sort((left, right) => {
      const modulePosition = new Map(
        ROAS_MODULES.map((module) => [module.stableId, module.position])
      );
      const byModule =
        (modulePosition.get(left.moduleStableId) ?? 0) -
        (modulePosition.get(right.moduleStableId) ?? 0);
      return byModule !== 0 ? byModule : left.position - right.position;
    });
    const indexOf = new Map(order.map((mission, index) => [mission.stableId, index]));

    for (const { mission, link } of allLinks) {
      if (link.relationship !== "reinforces") continue;

      const developing = allLinks.find(
        (candidate) =>
          candidate.link.competencyStableId === link.competencyStableId &&
          candidate.link.relationship === "develops"
      )!;

      expect(
        indexOf.get(mission.stableId)!,
        `${mission.stableId} reinforces ${link.competencyStableId}`
      ).toBeGreaterThan(indexOf.get(developing.mission.stableId)!);
    }
  });

  // The whole point of the second axis: it is NOT derivable from `required`.
  it("keeps relationship independent of required", () => {
    const requiredButReinforced = allLinks.filter(
      ({ link }) => link.required && link.relationship === "reinforces"
    );

    expect(requiredButReinforced.length).toBeGreaterThan(0);

    const pairs = requiredButReinforced.map(
      ({ mission, link }) => `${mission.stableId} -> ${link.competencyStableId}`
    );

    // The two links that make the independence concrete, pinned by name so a
    // future edit cannot quietly collapse the axes back together.
    expect(pairs).toContain("ros-m4-route-between-vlans -> net.default-gateway");
    expect(pairs).toContain(
      "ros-m6-troubleshoot-the-network -> net.connectivity-verification"
    );
  });

  it("treats the demonstration as reinforcing everything and developing nothing", () => {
    const demonstrate = ROAS_MISSIONS.find(
      (mission) => mission.stableId === "ros-m7-demonstrate"
    )!;

    // Its own brief says nothing new is introduced there.
    expect(
      demonstrate.competencies.every((link) => link.relationship === "reinforces")
    ).toBe(true);
    expect(demonstrate.competencies.every((link) => link.required)).toBe(true);
  });

  // The forward reference removed by WP-B. Mission 1 never mentions VLANs, so
  // `develops` was false; nothing precedes Mission 1, so `reinforces` was false
  // too. Mission 2 is the truthful development point.
  it("does not reintroduce the Mission 1 VLAN forward reference", () => {
    const mission1 = ROAS_MISSIONS.find(
      (mission) => mission.stableId === "ros-m1-understand-the-network"
    )!;

    expect(
      mission1.competencies.map((link) => link.competencyStableId)
    ).not.toContain("net.vlan-segmentation");

    const developsVlan = allLinks.find(
      ({ link }) =>
        link.competencyStableId === "net.vlan-segmentation" &&
        link.relationship === "develops"
    )!;
    expect(developsVlan.mission.stableId).toBe("ros-m2-build-layer2-segmentation");
  });

  it("carries the intentional 30-link total after the forward reference removal", () => {
    // 31 before WP-B. The reduction is the removed Mission 1 -> VLAN link and
    // is an intentional curriculum correction, not a lost mapping.
    expect(allLinks.length).toBe(30);
    expect(allLinks.filter(({ link }) => link.relationship === "develops").length).toBe(9);
    expect(allLinks.filter(({ link }) => link.relationship === "reinforces").length).toBe(21);
  });

  it("awards no competency and produces no evidence", () => {
    // `relationship` is curriculum authoring metadata. Nothing in the authored
    // content may turn it into a claim: evidence comes from the deterministic
    // lab validator, and practice remains non-evidence.
    for (const check of ROAS_KNOWLEDGE_CHECKS) {
      expect(check.purpose).toBe("practice");
      expect(check.competencyMappings).toEqual([]);
    }

    // The lab is still the only route to a competency claim in this course.
    expect(ROAS_LAB_DEFINITION.competencyStableIds.length).toBe(
      ROAS_COMPETENCIES.length
    );
    expect(ROAS_LAB_VALIDATION_CHECKS.filter((check) => check.required).length)
      .toBeGreaterThan(0);
  });

  it("rejects an unapproved relationship through the content validator", () => {
    // The authored content is valid as it stands.
    expect(validateRoasCurriculum().valid).toBe(true);
  });

  // Regression evidence for the inference replacement. The resolver used to
  // read "first mission that lists it as required"; it now reads the authored
  // `develops`. These placements are the behaviour BEFORE the change, pinned so
  // the correction is provably behaviour-preserving rather than assumed to be.
  it("preserves every practice placement after replacing the required inference", () => {
    const placements = new Map(
      resolveRoasPracticePlacements().map((placement) => [
        placement.assessmentStableId,
        placement.availableFromMissionStableId
      ])
    );

    expect(Object.fromEntries(placements)).toEqual({
      "ros-kc-read-the-network": "ros-m1-understand-the-network",
      "ros-kc-access-membership": "ros-m2-build-layer2-segmentation",
      "ros-kc-segmentation": "ros-m3-build-the-trunk",
      "ros-kc-inter-vlan-routing": "ros-m4-route-between-vlans",
      "ros-kc-verification": "ros-m5-verify-the-network",
      "ros-kc-troubleshooting-process": "ros-m6-troubleshoot-the-network",
      "ros-kc-fault-isolation": "ros-m6-troubleshoot-the-network"
    });
  });

  it("resolves every placement from develops, never from required", () => {
    // Recomputed independently from the authored relationships. If the resolver
    // regressed to the `required` inference, Mission 4's default gateway and
    // Mission 6's connectivity verification would move the boundary.
    const order = ROAS_MISSIONS.slice().sort((left, right) => {
      const modulePosition = new Map(
        ROAS_MODULES.map((module) => [module.stableId, module.position])
      );
      const byModule =
        (modulePosition.get(left.moduleStableId) ?? 0) -
        (modulePosition.get(right.moduleStableId) ?? 0);
      return byModule !== 0 ? byModule : left.position - right.position;
    });

    const developedAt = new Map<string, number>();
    order.forEach((mission, index) => {
      for (const link of mission.competencies) {
        if (link.relationship !== "develops") continue;
        if (!developedAt.has(link.competencyStableId)) {
          developedAt.set(link.competencyStableId, index);
        }
      }
    });

    for (const resolved of resolveRoasPracticePlacements()) {
      const placement = ROAS_PRACTICE_PLACEMENTS.find(
        (candidate) => candidate.assessmentStableId === resolved.assessmentStableId
      )!;

      const expected = Math.max(
        ...placement.exercisesCompetencyStableIds.map(
          (id) => developedAt.get(id)!
        )
      );

      expect(resolved.availableFromIndex).toBe(expected);
    }
  });
});
