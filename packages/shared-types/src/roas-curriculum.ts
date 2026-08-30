import { validateAssessmentDefinition, type AssessmentDefinition } from "./assessment";
import { validateLabDefinition, type LabDefinition } from "./labs";

/**
 * ROAS-2 — the Router-on-a-Stick connected curriculum.
 *
 * ## Why this exists
 *
 * `LEARN-008` section 8.1 item 4 records the blocker in one line: "The connected
 * curriculum does not exist. Reuse cannot be demonstrated until the experiences
 * that reuse each other are authored." `MVP_IMPLEMENTATION_SEQUENCE.md` section
 * 15e (DEC-049) requires one connected experience, and section 16 requires at
 * least one publishable course and one practical lab. ROAS-1 built the authoring
 * mechanism; this module is the first content authored through it.
 *
 * ## Why the content lives here rather than in SQL or in prose
 *
 * The curriculum schema stores structure and references. It has no lesson-body
 * column, and `curriculum_assets` requires an absolute http(s) URI, so content
 * bodies deliberately live outside the database. Holding the course as typed
 * data in `shared-types` means the same validators the server runs
 * (`validateAssessmentDefinition`, `validateLabDefinition`) can be applied to it
 * directly, in a unit test, before anything is written anywhere.
 *
 * This module writes nothing. It has no Supabase import, no route and no side
 * effect. Authoring happens by driving the existing Founder-guarded admin
 * operations, whose exact order `buildRoasAuthoringPlan` derives.
 *
 * ## The three layers stay separate, exactly as ROAS-1 left them
 *
 *   CURRICULUM   what the learner must learn and demonstrate  (this module)
 *   LAB          the environment and its deterministic checks (this module,
 *                expressed only as capabilities and probe ids)
 *   PROVIDER     how anything realises that environment       (not here at all)
 *
 * No provider is named. Capabilities describe requirements, and ROAS-1's
 * `PROVIDER_SPECIFIC_CAPABILITY_TOKENS` rejects the alternative.
 *
 * ## Deterministic validation stays authoritative
 *
 * Knowledge checks in this course are `purpose: "practice"`. They support
 * learning and produce no evidence. The competency claim is settled by the lab
 * validator's required checks and by nothing else. No AI participates in any
 * step below; explanation is a separate concern from adjudication.
 */

/* ------------------------------------------------------------------ *
 * Topology
 *
 * One switch, one router, two hosts, two VLANs. Small enough to hold in
 * your head, large enough that every competency in the course is genuinely
 * required to make it work.
 * ------------------------------------------------------------------ */

export interface RoasVlan {
  id: number;
  name: string;
  network: string;
  gatewayAddress: string;
}

export interface RoasHost {
  role: string;
  vlanId: number;
  address: string;
  defaultGateway: string;
  switchPort: string;
}

export const ROAS_VLANS: readonly RoasVlan[] = [
  {
    id: 10,
    name: "WORKSTATIONS",
    network: "192.168.10.0/24",
    gatewayAddress: "192.168.10.1"
  },
  {
    id: 20,
    name: "SERVERS",
    network: "192.168.20.0/24",
    gatewayAddress: "192.168.20.1"
  }
];

export const ROAS_HOSTS: readonly RoasHost[] = [
  {
    role: "pc-a",
    vlanId: 10,
    address: "192.168.10.10/24",
    defaultGateway: "192.168.10.1",
    switchPort: "FastEthernet0/1"
  },
  {
    role: "pc-b",
    vlanId: 20,
    address: "192.168.20.10/24",
    defaultGateway: "192.168.20.1",
    switchPort: "FastEthernet0/2"
  }
];

/** The single tagged link every inter-VLAN packet must cross. */
export const ROAS_TRUNK_LINK = {
  switchInterface: "GigabitEthernet0/1",
  routerInterface: "GigabitEthernet0/0",
  taggedVlanIds: [10, 20] as readonly number[]
} as const;

export const ROAS_ROUTER_SUBINTERFACES = [
  { name: "GigabitEthernet0/0.10", vlanId: 10, address: "192.168.10.1/24" },
  { name: "GigabitEthernet0/0.20", vlanId: 20, address: "192.168.20.1/24" }
] as const;

/* ------------------------------------------------------------------ *
 * Competencies
 *
 * The most consequential decision in ROAS-2.
 *
 * These identities are DOMAIN-scoped (`net.`), never course-scoped. A Linux
 * mission that asks a learner to verify a default gateway must be able to
 * reference `net.default-gateway` directly. If this had been authored as
 * `roas.default-gateway`, every later course would have to either duplicate the
 * competency — splitting one learner ability into several unrelated records —
 * or reference a networking course by name from inside a Linux course.
 *
 * DEC-049 and `Learning-OS.md` section 21 require reuse, and `LEARN-008`
 * section 8.1 confirms the substrate is already course-agnostic:
 * `student_review_state` and `student_competency_state` are keyed on the
 * competency stable id with no course column, and `mission_competencies` links
 * ANY mission to ANY competency. Nothing else was needed. This module adds no
 * cross-course mechanism because the mechanism already exists; it only declines
 * to poison the identity.
 * ------------------------------------------------------------------ */

/**
 * Approved domain prefixes for a reusable competency identity.
 *
 * Held as data so `validateRoasCurriculum` asserts the rule directly rather
 * than describing it, and so adding a course later cannot quietly introduce a
 * course-scoped competency.
 */
export const ROAS_REUSABLE_COMPETENCY_DOMAIN_PREFIXES: readonly string[] = [
  "net."
];

export interface RoasCompetency {
  stableId: string;
  title: string;
  description: string;
}

export const ROAS_COMPETENCIES: readonly RoasCompetency[] = [
  {
    stableId: "net.ip-addressing",
    title: "IPv4 addressing",
    description:
      "Assign and interpret an IPv4 address and prefix length, and determine which addresses a host can reach without assistance from a router."
  },
  {
    stableId: "net.subnet-boundaries",
    title: "Subnet boundaries",
    description:
      "Determine from an address and prefix length whether two hosts share a subnet, and recognise the boundary at which forwarding becomes a router's responsibility."
  },
  {
    stableId: "net.vlan-segmentation",
    title: "VLAN segmentation",
    description:
      "Explain and apply VLANs as separate broadcast domains on shared switching hardware, and predict what separation does to reachability."
  },
  {
    stableId: "net.access-port-membership",
    title: "Access port membership",
    description:
      "Place a switch port in the correct VLAN for the host attached to it, and recognise the symptoms of a port placed in the wrong one."
  },
  {
    stableId: "net.trunking-dot1q",
    title: "802.1Q trunking",
    description:
      "Configure and reason about a trunk that carries multiple VLANs over one link, including which VLANs the trunk is permitted to carry."
  },
  {
    stableId: "net.inter-vlan-routing",
    title: "Inter-VLAN routing",
    description:
      "Provide Layer-3 forwarding between VLANs using router subinterfaces bound to VLAN tags, so separated segments can communicate deliberately."
  },
  {
    stableId: "net.default-gateway",
    title: "Default gateway relationships",
    description:
      "Identify the correct default gateway for a host and explain why off-subnet traffic depends on it."
  },
  {
    stableId: "net.connectivity-verification",
    title: "Connectivity verification",
    description:
      "Choose verification steps that establish what actually works, and distinguish a test that confirms a hypothesis from one merely consistent with it."
  },
  {
    stableId: "net.fault-isolation",
    title: "Network fault isolation",
    description:
      "Narrow a connectivity failure to a specific boundary using evidence, correct the cause, and prove the repaired state."
  }
];

/**
 * Prerequisite edges between competencies.
 *
 * Kept deliberately shallow. `buildLearningPathQualityReport` rejects a cyclic
 * prerequisite graph, and a deep chain would gate a learner out of the very
 * practice that teaches the dependency.
 */
export const ROAS_COMPETENCY_PREREQUISITES: readonly {
  competencyStableId: string;
  prerequisiteCompetencyStableId: string;
}[] = [
  {
    competencyStableId: "net.subnet-boundaries",
    prerequisiteCompetencyStableId: "net.ip-addressing"
  },
  {
    competencyStableId: "net.default-gateway",
    prerequisiteCompetencyStableId: "net.subnet-boundaries"
  },
  {
    competencyStableId: "net.access-port-membership",
    prerequisiteCompetencyStableId: "net.vlan-segmentation"
  },
  {
    competencyStableId: "net.trunking-dot1q",
    prerequisiteCompetencyStableId: "net.vlan-segmentation"
  },
  {
    competencyStableId: "net.inter-vlan-routing",
    prerequisiteCompetencyStableId: "net.trunking-dot1q"
  },
  {
    competencyStableId: "net.fault-isolation",
    prerequisiteCompetencyStableId: "net.connectivity-verification"
  }
];

/* ------------------------------------------------------------------ *
 * Course structure
 * ------------------------------------------------------------------ */

export interface RoasCourseNode {
  stableId: string;
  learningPathStableId: string;
  position: number;
  title: string;
  description: string;
  estimatedMinutes: number;
}

export interface RoasModuleNode {
  stableId: string;
  courseStableId: string;
  position: number;
  title: string;
  description: string;
  estimatedMinutes: number;
}

export interface RoasMissionCompetencyLink {
  competencyStableId: string;
  required: boolean;
}

export interface RoasMissionNode {
  stableId: string;
  moduleStableId: string;
  position: number;
  title: string;
  /**
   * The instructional brief, stored in `missions.description`.
   *
   * Shaped for active learning rather than exposition: a short concept,
   * something to inspect, a decision the learner must make, a configuration
   * step, an observation, and an explanation. It is also the text the Search
   * Engine projects, which is why it reads as teaching rather than as metadata.
   */
  brief: string;
  estimatedMinutes: number;
  competencies: readonly RoasMissionCompetencyLink[];
}

export const ROAS_LEARNING_PATH_STABLE_ID = "connected-learning-mvp";

export const ROAS_COURSE: RoasCourseNode = {
  stableId: "router-on-a-stick",
  learningPathStableId: ROAS_LEARNING_PATH_STABLE_ID,
  position: 0,
  title: "Router-on-a-Stick: Build the Network",
  description:
    "Build a small two-VLAN network from an empty configuration, prove it works, break it, and repair it. You will segment a switch, carry both VLANs over a single tagged link, route between them from one router interface, and finish by diagnosing a fault you were not told the location of. Every idea here is introduced because the network in front of you needs it.",
  estimatedMinutes: 300
};

export const ROAS_MODULES: readonly RoasModuleNode[] = [
  {
    stableId: "ros-mod1-read-the-network",
    courseStableId: ROAS_COURSE.stableId,
    position: 0,
    title: "Read the Network",
    description:
      "Before configuring anything, learn to read a topology: what the devices are, where the boundaries sit, and which conversations should already be possible.",
    estimatedMinutes: 45
  },
  {
    stableId: "ros-mod2-segment-and-trunk",
    courseStableId: ROAS_COURSE.stableId,
    position: 1,
    title: "Segment and Trunk",
    description:
      "Create the Layer-2 structure: separate broadcast domains, put each host in the right one, and carry both over a single link to the router.",
    estimatedMinutes: 90
  },
  {
    stableId: "ros-mod3-route-and-verify",
    courseStableId: ROAS_COURSE.stableId,
    position: 2,
    title: "Route and Verify",
    description:
      "Give the separated segments a deliberate way to talk to each other, then establish what genuinely works rather than what appears to.",
    estimatedMinutes: 90
  },
  {
    stableId: "ros-mod4-diagnose-and-prove",
    courseStableId: ROAS_COURSE.stableId,
    position: 3,
    title: "Diagnose and Prove",
    description:
      "Find a fault you were not told the location of, repair it, and demonstrate the working network against deterministic checks.",
    estimatedMinutes: 75
  }
];

export const ROAS_MISSIONS: readonly RoasMissionNode[] = [
  {
    stableId: "ros-m1-understand-the-network",
    moduleStableId: "ros-mod1-read-the-network",
    position: 0,
    title: "Mission 1 — Understand the Network",
    brief: [
      "A network diagram is a set of claims about who can talk to whom. Your first job is to read those claims before you trust them.",
      "",
      "You have two hosts, one switch and one router. PC-A holds 192.168.10.10/24; PC-B holds 192.168.20.10/24. Both are cabled to the same switch.",
      "",
      "Inspect each host's address and prefix length, and work out the range each one considers local. Then decide, before you test anything: can PC-A reach PC-B right now?",
      "",
      "The prefix length is what settles it. A /24 tells PC-A that 192.168.10.x is reachable directly and that everything else must be handed to a router. 192.168.20.10 is not in that range, so PC-A will not attempt to deliver the frame itself — it will look for a default gateway.",
      "",
      "Write down the first address PC-A must be able to reach before it can reach anything outside its own subnet, and explain in one sentence why that address and not another. You will test that claim in Mission 5, and you will need it again the moment something breaks.",
      "",
      "Nothing is configured yet. That is deliberate: you are learning to predict behaviour from configuration, which is the skill that makes troubleshooting possible later."
    ].join("\n"),
    estimatedMinutes: 45,
    competencies: [
      { competencyStableId: "net.ip-addressing", required: true },
      { competencyStableId: "net.subnet-boundaries", required: true },
      { competencyStableId: "net.default-gateway", required: true },
      { competencyStableId: "net.vlan-segmentation", required: false }
    ]
  },
  {
    stableId: "ros-m2-build-layer2-segmentation",
    moduleStableId: "ros-mod2-segment-and-trunk",
    position: 0,
    title: "Mission 2 — Build Layer-2 Segmentation",
    brief: [
      "A switch, left alone, puts every port in one broadcast domain. A VLAN is how you cut that single domain into several without buying more switches.",
      "",
      "Create VLAN 10 (WORKSTATIONS) and VLAN 20 (SERVERS). Then place PC-A's port in VLAN 10 and PC-B's port in VLAN 20. A port assigned to exactly one VLAN, carrying untagged traffic for the host attached to it, is an access port — the host has no idea the VLAN exists.",
      "",
      "Before you apply anything, decide what you expect to change. PC-A and PC-B could not reach each other in Mission 1 because they are in different subnets. After segmentation, they still cannot — but for a second, independent reason.",
      "",
      "Apply the configuration and inspect the switch's VLAN membership table. Confirm each port sits in the VLAN matching the host's address range.",
      "",
      "Now explain the difference that matters: subnetting is a decision the host makes about what it will attempt; VLAN membership is a decision the switch makes about what it will carry. Two hosts in the same VLAN but different subnets still cannot talk. Two hosts in the same subnet but different VLANs also cannot talk. You have now built the second condition on purpose.",
      "",
      "A mismatch between these two decisions is one of the most common faults in real networks, and you will meet it again in Mission 6."
    ].join("\n"),
    estimatedMinutes: 45,
    competencies: [
      { competencyStableId: "net.vlan-segmentation", required: true },
      { competencyStableId: "net.access-port-membership", required: true },
      { competencyStableId: "net.ip-addressing", required: false }
    ]
  },
  {
    stableId: "ros-m3-build-the-trunk",
    moduleStableId: "ros-mod2-segment-and-trunk",
    position: 1,
    title: "Mission 3 — Build the Trunk",
    brief: [
      "The router has one physical link to the switch, and two VLANs need to reach it. An access port carries one VLAN untagged, so an access port cannot solve this.",
      "",
      "A trunk can. On a trunk, the switch adds a small tag to each frame identifying the VLAN it came from, and the receiver uses that tag to keep the traffic separated. IEEE 802.1Q defines the tag format; what matters operationally is that the tag is the only thing preserving the separation once both VLANs share a wire.",
      "",
      "Configure GigabitEthernet0/1 on the switch as a trunk toward the router, and permit VLANs 10 and 20 on it.",
      "",
      "Pause on that last step. A trunk has a list of VLANs it is allowed to carry. It is entirely possible to build a trunk that works perfectly for one VLAN and silently discards another — the link will look healthy, the interface will be up, and half your network will be unreachable.",
      "",
      "Inspect the trunk and confirm both VLAN IDs appear in the allowed list. Then explain what a frame from PC-B now looks like as it crosses this link, and what it looks like when it leaves PC-B's access port. The tag exists only on the trunk; the host never sees it.",
      "",
      "Nothing can route yet. You have built the road, not the destination."
    ].join("\n"),
    estimatedMinutes: 45,
    competencies: [
      { competencyStableId: "net.trunking-dot1q", required: true },
      { competencyStableId: "net.vlan-segmentation", required: false }
    ]
  },
  {
    stableId: "ros-m4-route-between-vlans",
    moduleStableId: "ros-mod3-route-and-verify",
    position: 0,
    title: "Mission 4 — Route Between VLANs",
    brief: [
      "Separation was the point. Now you decide, deliberately, where that separation is crossed — and the router is the place you make that decision.",
      "",
      "The router has one physical interface facing the switch, and it needs an address in both subnets. Divide it: create GigabitEthernet0/0.10 and GigabitEthernet0/0.20, bind each subinterface to its VLAN tag, and give each the gateway address for that subnet — 192.168.10.1/24 and 192.168.20.1/24.",
      "",
      "This is the router-on-a-stick pattern. One link, one physical interface, one logical interface per VLAN, each one terminating that VLAN's tagged traffic.",
      "",
      "Before applying it, answer two questions. Which address did you conclude in Mission 1 that PC-A must reach first? And what happens if a subinterface's tag does not match the VLAN the switch is sending?",
      "",
      "The second question is worth sitting with. A subinterface configured with the wrong tag is not an error the device reports. It is simply a logical interface waiting for traffic that never arrives, while traffic that does arrive is dropped for having no interface that claims it.",
      "",
      "Apply the configuration, then explain the full path in your own words: PC-A, access port, VLAN 10, switch, tagged trunk, subinterface .10, routed, subinterface .20, tagged trunk, switch, access port, PC-B. Every one of those hops is something you configured. If any is wrong, the ping fails and the diagram still looks correct."
    ].join("\n"),
    estimatedMinutes: 45,
    competencies: [
      { competencyStableId: "net.inter-vlan-routing", required: true },
      { competencyStableId: "net.default-gateway", required: true },
      { competencyStableId: "net.trunking-dot1q", required: false },
      { competencyStableId: "net.ip-addressing", required: false }
    ]
  },
  {
    stableId: "ros-m5-verify-the-network",
    moduleStableId: "ros-mod3-route-and-verify",
    position: 1,
    title: "Mission 5 — Verify the Network",
    brief: [
      "A working network and a network that appears to work are different things, and the difference is the quality of your verification.",
      "",
      "Verify in an order that isolates rather than one that reassures. From PC-A, reach its own gateway first: success proves the access port, the VLAN, the trunk for VLAN 10, and the router's .10 subinterface all behave. Only then reach PC-B.",
      "",
      "Then do the same from PC-B, and be careful about what each result licenses you to conclude.",
      "",
      "Here is the trap. PC-A can often reach 192.168.20.1 even when VLAN 20 is completely broken on the trunk — because that address lives on the router, and the router answers for it after receiving your packet over VLAN 10. Reaching a gateway address does not prove that gateway's VLAN is working. Reaching a host inside that VLAN does.",
      "",
      "For each test you run, record what it would rule out if it failed. A test whose failure would not narrow anything is not a diagnostic step; it is reassurance.",
      "",
      "Finish by explaining, in a short statement, exactly what you have proven end to end and what you have not. In Mission 6 something will be wrong, and this statement is what tells you where to stop looking."
    ].join("\n"),
    estimatedMinutes: 45,
    competencies: [
      { competencyStableId: "net.connectivity-verification", required: true },
      { competencyStableId: "net.default-gateway", required: false },
      { competencyStableId: "net.inter-vlan-routing", required: false }
    ]
  },
  {
    stableId: "ros-m6-troubleshoot-the-network",
    moduleStableId: "ros-mod4-diagnose-and-prove",
    position: 0,
    title: "Mission 6 — Troubleshoot the Network",
    brief: [
      "The environment you are given has been altered. One change was made to a configuration you previously had working. You will not be told which device, which layer, or which command.",
      "",
      "The reported symptom is all you get: PC-A can reach 192.168.10.1 and 192.168.20.1, but cannot reach PC-B at 192.168.20.10.",
      "",
      "Work the boundary, not the device list. Each of these is consistent with the symptom, and your job is to find evidence that separates them rather than changing configuration until something works:",
      "",
      "- PC-B's access port is in the wrong VLAN",
      "- the trunk no longer permits VLAN 20",
      "- the router's .20 subinterface carries the wrong VLAN tag",
      "- PC-B's own address or default gateway is wrong",
      "",
      "Note carefully what PC-A reaching 192.168.20.1 does and does not prove. From Mission 5: that address is on the router, and the router will answer it over VLAN 10. It tells you the .20 subinterface exists and is addressed. It tells you nothing about whether VLAN 20 traffic ever reaches the router.",
      "",
      "Choose one observation that would confirm a cause rather than merely be consistent with it, make that observation, and only then change anything. Correct the single fault. Do not repair things that were never broken — an unnecessary change is how a one-fault problem becomes a two-fault problem.",
      "",
      "Then verify the repaired state using the order you built in Mission 5, and explain which piece of evidence eliminated each of the other three candidates."
    ].join("\n"),
    estimatedMinutes: 45,
    competencies: [
      { competencyStableId: "net.fault-isolation", required: true },
      { competencyStableId: "net.connectivity-verification", required: true },
      { competencyStableId: "net.vlan-segmentation", required: false },
      { competencyStableId: "net.access-port-membership", required: false },
      { competencyStableId: "net.trunking-dot1q", required: false },
      { competencyStableId: "net.inter-vlan-routing", required: false }
    ]
  },
  {
    stableId: "ros-m7-demonstrate",
    moduleStableId: "ros-mod4-diagnose-and-prove",
    position: 1,
    title: "Mission 7 — Demonstrate",
    brief: [
      "Build the network from a clean starting configuration and prove it works. Nothing new is introduced here; this is where you show that the previous six missions became ability rather than familiarity.",
      "",
      "Starting from an unconfigured environment, deliver a network in which:",
      "",
      "- VLAN 10 and VLAN 20 exist on the switch",
      "- each host's access port is in the VLAN matching its address range",
      "- the trunk to the router carries both VLANs",
      "- the router has a subinterface per VLAN, correctly tagged and correctly addressed",
      "- each host reaches its own default gateway",
      "- PC-A and PC-B reach each other across the VLAN boundary",
      "",
      "Your result is judged by a deterministic validator that inspects the running configuration and tests reachability. It checks conditions, not wording, and it reaches the same conclusion every time it runs. If a check fails you are told which condition was not met and why it matters, and you may reset and try again.",
      "",
      "Your written explanations elsewhere in this course are for your own understanding and for later review. They are not what decides this. The network either behaves or it does not."
    ].join("\n"),
    estimatedMinutes: 30,
    competencies: [
      { competencyStableId: "net.ip-addressing", required: true },
      { competencyStableId: "net.subnet-boundaries", required: true },
      { competencyStableId: "net.vlan-segmentation", required: true },
      { competencyStableId: "net.access-port-membership", required: true },
      { competencyStableId: "net.trunking-dot1q", required: true },
      { competencyStableId: "net.inter-vlan-routing", required: true },
      { competencyStableId: "net.default-gateway", required: true },
      { competencyStableId: "net.connectivity-verification", required: true },
      { competencyStableId: "net.fault-isolation", required: true }
    ]
  }
];

/* ------------------------------------------------------------------ *
 * Knowledge checks
 *
 * `purpose: "practice"` throughout. These support learning and produce no
 * evidence: `validateAssessmentDefinition` only requires a competency mapping
 * for `evidence_producing` assessments, and making these evidence-producing
 * would create a second, non-deterministic route to a competency claim that the
 * lab validator is supposed to own.
 *
 * Questions ask what a configuration will do, not what a standard is called.
 * ------------------------------------------------------------------ */

export const ROAS_KNOWLEDGE_CHECKS: readonly AssessmentDefinition[] = [
  {
    // PRACTICE-ARCH-1A. Mission 1 reinforcement: read the topology before
    // touching it. Exercises only addressing, subnet boundaries and the
    // gateway relationship, so it derives to Mission 1 and asks nothing that
    // VLANs, trunks or routing configuration would answer.
    stableId: "ros-kc-read-the-network",
    version: 1,
    title: "Knowledge check — reading the network",
    purpose: "practice",
    passingPercent: 70,
    questions: [
      {
        stableId: "ros-kc-rtn-q1",
        version: 1,
        type: "single_choice",
        prompt:
          "Before anything is configured, PC-A holds 192.168.10.10/24 and PC-B holds 192.168.20.10/24. What do those two addresses alone tell you about a conversation between them?",
        options: [
          { id: "a", text: "They are in the same subnet, so the two hosts can exchange traffic directly." },
          { id: "b", text: "They are in different subnets, so anything between them has to be forwarded by a device that routes between the two." },
          { id: "c", text: "They are in different subnets, so the two hosts can never exchange traffic." },
          { id: "d", text: "Whether they share a subnet depends on which switch ports they are plugged into." }
        ],
        correctOptionIds: ["b"],
        points: 2
      },
      {
        stableId: "ros-kc-rtn-q2",
        version: 1,
        type: "single_choice",
        prompt:
          "A host is given an address and prefix length but no default gateway. Which traffic does that omission affect?",
        options: [
          { id: "a", text: "All of its traffic, including to hosts in its own subnet." },
          { id: "b", text: "Only traffic to destinations outside its own subnet." },
          { id: "c", text: "Only traffic to destinations inside its own subnet." },
          { id: "d", text: "None of it; a default gateway matters only for reaching the internet." }
        ],
        correctOptionIds: ["b"],
        points: 1
      },
      {
        stableId: "ros-kc-rtn-q3",
        version: 1,
        type: "boolean",
        prompt:
          "Two hosts addressed 192.168.10.10/24 and 192.168.10.200/24 need a router in order to exchange traffic with each other.",
        options: [
          { id: "true", text: "True" },
          { id: "false", text: "False" }
        ],
        correctOptionIds: ["false"],
        points: 1
      }
    ],
    competencyMappings: [],
    published: true
  },
  {
    // PRACTICE-ARCH-1A. Mission 2 reinforcement: separation and membership.
    // Exercises VLAN segmentation and access-port membership on top of Mission
    // 1's addressing, so it derives to Mission 2. Nothing here requires a trunk
    // — that reasoning is Mission 3's, and its own check already covers it.
    stableId: "ros-kc-access-membership",
    version: 1,
    title: "Knowledge check — separation and port membership",
    purpose: "practice",
    passingPercent: 70,
    questions: [
      {
        stableId: "ros-kc-am-q1",
        version: 1,
        type: "single_choice",
        prompt:
          "Two hosts hold addresses in the SAME subnet and are cabled to the same switch, but their access ports are assigned to different VLANs. No router is involved. What happens when one tries to reach the other?",
        options: [
          { id: "a", text: "It succeeds, because the two hosts share a subnet." },
          { id: "b", text: "It fails, because the switch treats the two VLANs as separate broadcast domains and does not forward between them." },
          { id: "c", text: "It succeeds, because VLANs only affect traffic that leaves the switch." },
          { id: "d", text: "It fails, and it would succeed as soon as both hosts are given a default gateway." }
        ],
        correctOptionIds: ["b"],
        points: 2
      },
      {
        stableId: "ros-kc-am-q2",
        version: 1,
        type: "single_choice",
        prompt:
          "A host stops reaching anything after its patch lead is moved to a different switch port. Its address, prefix length and default gateway are unchanged. What is the most likely explanation?",
        options: [
          { id: "a", text: "The new port belongs to a different VLAN from the one its address range is used in." },
          { id: "b", text: "A host has to be readdressed whenever it moves to a different port." },
          { id: "c", text: "The default gateway has to be changed to match the new port." },
          { id: "d", text: "Moving a lead clears the host's address until it is restarted." }
        ],
        correctOptionIds: ["a"],
        points: 2
      },
      {
        stableId: "ros-kc-am-q3",
        version: 1,
        type: "boolean",
        prompt:
          "Placing two hosts in the same VLAN is enough for them to reach each other, whatever addresses they hold.",
        options: [
          { id: "true", text: "True" },
          { id: "false", text: "False" }
        ],
        correctOptionIds: ["false"],
        points: 1
      }
    ],
    competencyMappings: [],
    published: true
  },
  {
    stableId: "ros-kc-segmentation",
    version: 1,
    title: "Knowledge check — segmentation and trunking",
    purpose: "practice",
    passingPercent: 70,
    questions: [
      {
        stableId: "ros-kc-seg-q1",
        version: 1,
        type: "single_choice",
        prompt:
          "PC-A (192.168.10.10/24, VLAN 10) and PC-B (192.168.20.10/24, VLAN 20) are cabled to the same switch and both access ports are correctly assigned. No router is attached. PC-A cannot reach PC-B. Which statement is most accurate?",
        options: [
          { id: "a", text: "The access ports must be converted to trunks so the two hosts can exchange tagged frames." },
          { id: "b", text: "The hosts are in separate broadcast domains and in separate subnets, and nothing is performing Layer-3 forwarding between them." },
          { id: "c", text: "The hosts must be moved into the same VLAN before they can use different subnets." },
          { id: "d", text: "802.1Q tagging is missing on the access ports, so the switch cannot identify the VLANs." }
        ],
        correctOptionIds: ["b"],
        points: 1
      },
      {
        stableId: "ros-kc-seg-q2",
        version: 1,
        type: "single_choice",
        prompt:
          "The link from the switch to the router must carry traffic for both VLAN 10 and VLAN 20. What does the switch place on that link?",
        options: [
          { id: "a", text: "Untagged frames; the router infers the VLAN from each frame's source address." },
          { id: "b", text: "Frames carrying a VLAN tag, so the receiver can tell which VLAN each frame belongs to." },
          { id: "c", text: "One copy of every frame per VLAN, regardless of its destination." },
          { id: "d", text: "Frames for VLAN 10 only, because a trunk carries a single native VLAN." }
        ],
        correctOptionIds: ["b"],
        points: 1
      },
      {
        stableId: "ros-kc-seg-q3",
        version: 1,
        type: "boolean",
        prompt:
          "A host addressed 192.168.10.10/24 with default gateway 192.168.10.1 is connected to a switch port assigned to VLAN 20. It will still reach its default gateway.",
        options: [
          { id: "true", text: "True" },
          { id: "false", text: "False" }
        ],
        correctOptionIds: ["false"],
        points: 1
      }
    ],
    competencyMappings: [],
    published: true
  },
  {
    stableId: "ros-kc-inter-vlan-routing",
    version: 1,
    title: "Knowledge check — inter-VLAN routing",
    purpose: "practice",
    passingPercent: 70,
    questions: [
      {
        stableId: "ros-kc-ivr-q1",
        version: 1,
        type: "single_choice",
        prompt:
          "A router has one physical link to the switch but must act as the default gateway for two VLANs. Which approach matches that constraint?",
        options: [
          { id: "a", text: "One subinterface per VLAN, each bound to that VLAN's tag and holding that VLAN's gateway address." },
          { id: "b", text: "One interface holding both gateway addresses, with no VLAN tag configuration." },
          { id: "c", text: "A separate physical router interface for each VLAN." },
          { id: "d", text: "The switch performs the routing, and the router only forwards traffic beyond the site." }
        ],
        correctOptionIds: ["a"],
        points: 1
      },
      {
        stableId: "ros-kc-ivr-q2",
        version: 1,
        type: "multiple_choice",
        prompt:
          "PC-A (VLAN 10) reaches its own gateway 192.168.10.1 but cannot reach PC-B at 192.168.20.10. Select every cause consistent with both results.",
        options: [
          { id: "a", text: "The trunk to the router does not permit VLAN 20." },
          { id: "b", text: "The router's VLAN 20 subinterface is missing or carries the wrong tag." },
          { id: "c", text: "PC-A's switch port is in the wrong VLAN." },
          { id: "d", text: "PC-B is powered off, or its address or default gateway is wrong." }
        ],
        correctOptionIds: ["a", "b", "d"],
        points: 2
      },
      {
        stableId: "ros-kc-ivr-q3",
        version: 1,
        type: "boolean",
        prompt:
          "Once the router is performing inter-VLAN routing, the hosts no longer need a default gateway configured.",
        options: [
          { id: "true", text: "True" },
          { id: "false", text: "False" }
        ],
        correctOptionIds: ["false"],
        points: 1
      }
    ],
    competencyMappings: [],
    published: true
  },
  {
    // PRACTICE-ARCH-1A. Mission 5 reinforcement: what a result actually
    // proves. Exercises connectivity verification on top of everything already
    // built, so it derives to Mission 5. It stops short of diagnosing a fault —
    // that is Mission 6's work, and its own check covers it.
    stableId: "ros-kc-verification",
    version: 1,
    title: "Knowledge check — proving it works",
    purpose: "practice",
    passingPercent: 70,
    questions: [
      {
        stableId: "ros-kc-ver-q1",
        version: 1,
        type: "single_choice",
        prompt:
          "PC-A successfully reaches its own default gateway. Which conclusion does that result, on its own, actually support?",
        options: [
          { id: "a", text: "Inter-VLAN routing is working." },
          { id: "b", text: "PC-A can reach the gateway address for its own VLAN; nothing about traffic to the other VLAN has been shown either way." },
          { id: "c", text: "The link to the router is carrying both VLANs." },
          { id: "d", text: "PC-B is correctly addressed." }
        ],
        correctOptionIds: ["b"],
        points: 2
      },
      {
        stableId: "ros-kc-ver-q2",
        version: 1,
        type: "single_choice",
        prompt:
          "You need to establish that a host in one VLAN can reach a host in the other. Which single result demonstrates that, rather than merely being consistent with it?",
        options: [
          { id: "a", text: "Both hosts reach their own default gateways." },
          { id: "b", text: "Traffic sent from one host's address to the other host's address is exchanged successfully across the VLAN boundary." },
          { id: "c", text: "The router reports both of its VLAN subinterfaces as up." },
          { id: "d", text: "Both hosts appear in the switch's address table." }
        ],
        correctOptionIds: ["b"],
        points: 2
      },
      {
        stableId: "ros-kc-ver-q3",
        version: 1,
        type: "boolean",
        prompt:
          "One successful test between a single pair of hosts is enough to prove that every path the design requires is working.",
        options: [
          { id: "true", text: "True" },
          { id: "false", text: "False" }
        ],
        correctOptionIds: ["false"],
        points: 1
      }
    ],
    competencyMappings: [],
    published: true
  },
  {
    // PRACTICE-ARCH-1A. Mission 6 reinforcement: the PROCESS of isolating a
    // fault — hypothesis, next useful observation, and proving a repair. It
    // exercises fault isolation, so it derives to Mission 6.
    //
    // Deliberately distinct from ros-kc-fault-isolation below, which stays in
    // cumulative review: that one asks which single fault explains several
    // results at once, integrating trunking, routing and verification. This one
    // asks how you would go about finding out at all.
    stableId: "ros-kc-troubleshooting-process",
    version: 1,
    title: "Knowledge check — narrowing a fault",
    purpose: "practice",
    passingPercent: 70,
    questions: [
      {
        stableId: "ros-kc-tsp-q1",
        version: 1,
        type: "single_choice",
        prompt:
          "PC-A cannot reach PC-B. You have established that PC-A reaches its own default gateway, and you have looked at nothing else yet. Which step narrows the problem most?",
        options: [
          { id: "a", text: "Repeat the same test from PC-A to PC-B." },
          { id: "b", text: "Establish whether PC-B reaches its own default gateway, which splits the path at the boundary between the two halves." },
          { id: "c", text: "Replace PC-A's patch lead." },
          { id: "d", text: "Restart the switch and try again." }
        ],
        correctOptionIds: ["b"],
        points: 2
      },
      {
        stableId: "ros-kc-tsp-q2",
        version: 1,
        type: "single_choice",
        prompt:
          "You changed one thing and the original failing test now succeeds. What best establishes that you corrected the cause rather than disturbed a symptom?",
        options: [
          { id: "a", text: "The test succeeded when you repeated it." },
          { id: "b", text: "The observation that first identified the fault now shows the corrected state, and the end-to-end test also succeeds." },
          { id: "c", text: "No errors appeared while the change was being made." },
          { id: "d", text: "The change matched a configuration that had worked elsewhere." }
        ],
        correctOptionIds: ["b"],
        points: 2
      },
      {
        stableId: "ros-kc-tsp-q3",
        version: 1,
        type: "boolean",
        prompt:
          "If a change makes the symptom disappear, that change necessarily addressed the cause.",
        options: [
          { id: "true", text: "True" },
          { id: "false", text: "False" }
        ],
        correctOptionIds: ["false"],
        points: 1
      }
    ],
    competencyMappings: [],
    published: true
  },
  {
    stableId: "ros-kc-fault-isolation",
    version: 1,
    title: "Knowledge check — verification and fault isolation",
    purpose: "practice",
    passingPercent: 70,
    questions: [
      {
        stableId: "ros-kc-fi-q1",
        version: 1,
        type: "single_choice",
        prompt:
          "PC-A reaches 192.168.10.1 and also reaches 192.168.20.1. PC-B cannot reach 192.168.20.1. Which single fault best explains all three results at once?",
        options: [
          { id: "a", text: "The router has no subinterface for VLAN 20." },
          { id: "b", text: "The trunk is not carrying VLAN 20, so VLAN 20 frames from the switch never reach the router." },
          { id: "c", text: "PC-A's default gateway is configured incorrectly." },
          { id: "d", text: "The router's VLAN 10 subinterface holds the wrong address." }
        ],
        correctOptionIds: ["b"],
        points: 2
      },
      {
        stableId: "ros-kc-fi-q2",
        version: 1,
        type: "single_choice",
        prompt:
          "You suspect a host's access port is in the wrong VLAN. Which observation would confirm that cause, rather than merely being consistent with it?",
        options: [
          { id: "a", text: "The host cannot reach any address outside its own subnet." },
          { id: "b", text: "The switch reports the host's port as a member of a VLAN other than the one its address range belongs to." },
          { id: "c", text: "Pings from the host to its default gateway time out." },
          { id: "d", text: "The router's subinterface counters show no received traffic." }
        ],
        correctOptionIds: ["b"],
        points: 2
      },
      {
        stableId: "ros-kc-fi-q3",
        version: 1,
        type: "boolean",
        prompt:
          "Confirming that each host can reach its own default gateway is sufficient to prove that inter-VLAN routing is working.",
        options: [
          { id: "true", text: "True" },
          { id: "false", text: "False" }
        ],
        correctOptionIds: ["false"],
        points: 1
      }
    ],
    competencyMappings: [],
    published: true
  }
];

/* ------------------------------------------------------------------ *
 * Practice placement
 *
 * PRACTICE-ARCH-1. Where each knowledge check belongs, and when it becomes
 * answerable.
 *
 * ## Why this could not reuse `competencyMappings`
 *
 * `AssessmentDefinition` already carries `competencyMappings`, which looks like
 * the natural association. It is not usable here: `validateRoasCurriculum`
 * below FORBIDS a knowledge check from carrying one, because a competency
 * mapping is the route by which an assessment claims a competency. Practice
 * must never make that claim — the deterministic lab validator owns it. Reusing
 * that field to mean "this practice is about VLANs" would overload an evidence
 * relationship with a placement meaning and quietly reopen the route it exists
 * to close.
 *
 * So this is a genuinely new fact, not a duplicate of an existing one. Nothing
 * in the authored curriculum previously recorded what a practice check
 * exercises or where it belongs.
 *
 * ## What is authored here, and what is derived
 *
 * AUTHORED — two things only:
 *   - `scope`: whether a check reinforces one mission's material or
 *     deliberately integrates across the course. That is an instructional
 *     decision and cannot be computed.
 *   - `exercisesCompetencyStableIds`: which concepts the questions actually
 *     require. Read from the questions themselves, not from the title.
 *
 * DERIVED — everything else, from data that already exists:
 *   - when a check becomes answerable is the latest mission at which any
 *     exercised competency is first REQUIRED, using the missions' own
 *     `competencies` declarations and the authored module/mission ordering.
 *
 * No second ordering and no second curriculum truth: eligibility is a function
 * of the same declarations the learning path itself is built from.
 * ------------------------------------------------------------------ */

export type RoasPracticeScope = "mission" | "course_review";

export interface RoasPracticePlacement {
  assessmentStableId: string;
  /**
   * `mission` reinforces the material of the mission it becomes available at.
   * `course_review` deliberately integrates competencies developed across
   * several missions, and belongs in cumulative review rather than beneath any
   * single mission.
   */
  scope: RoasPracticeScope;
  /**
   * The competencies the questions require in order to be answerable.
   *
   * **This is not a competency claim.** Answering practice awards nothing and
   * proves nothing. It records what a learner must already have met for the
   * questions to be fair, which is what makes "do not show this yet" decidable.
   */
  exercisesCompetencyStableIds: readonly string[];
}

export const ROAS_PRACTICE_PLACEMENTS: readonly RoasPracticePlacement[] = [
  {
    // Addressing, subnet boundaries and the gateway relationship — the three
    // things Mission 1 develops. Nothing later is exercised, so it derives to
    // Mission 1 rather than being placed there by hand.
    assessmentStableId: "ros-kc-read-the-network",
    scope: "mission",
    exercisesCompetencyStableIds: [
      "net.ip-addressing",
      "net.subnet-boundaries",
      "net.default-gateway"
    ]
  },
  {
    // Separation and membership, on top of Mission 1's addressing. No trunk
    // competency, so it derives to Mission 2 and cannot drift later.
    assessmentStableId: "ros-kc-access-membership",
    scope: "mission",
    exercisesCompetencyStableIds: [
      "net.ip-addressing",
      "net.subnet-boundaries",
      "net.default-gateway",
      "net.vlan-segmentation",
      "net.access-port-membership"
    ]
  },
  {
    // Separate broadcast domains, tagged frames on the uplink, and a host in
    // the wrong VLAN. Everything it asks is settled by the end of module 2.
    assessmentStableId: "ros-kc-segmentation",
    scope: "mission",
    exercisesCompetencyStableIds: [
      "net.ip-addressing",
      "net.subnet-boundaries",
      "net.default-gateway",
      "net.vlan-segmentation",
      "net.access-port-membership",
      "net.trunking-dot1q"
    ]
  },
  {
    // Subinterfaces bound to VLAN tags, and why a host still needs a gateway.
    // It leans on the trunk from module 2, but its subject is module 3's.
    assessmentStableId: "ros-kc-inter-vlan-routing",
    scope: "mission",
    exercisesCompetencyStableIds: [
      "net.ip-addressing",
      "net.default-gateway",
      "net.access-port-membership",
      "net.trunking-dot1q",
      "net.inter-vlan-routing"
    ]
  },
  {
    // What a result proves versus what it is merely consistent with. Verifying
    // is Mission 5's competency, so that is where this derives.
    assessmentStableId: "ros-kc-verification",
    scope: "mission",
    exercisesCompetencyStableIds: [
      "net.default-gateway",
      "net.vlan-segmentation",
      "net.inter-vlan-routing",
      "net.connectivity-verification"
    ]
  },
  {
    // The process of narrowing a fault. Exercises fault isolation, so it
    // derives to Mission 6 — alongside, but distinct from, the cumulative
    // review item below.
    assessmentStableId: "ros-kc-troubleshooting-process",
    scope: "mission",
    exercisesCompetencyStableIds: [
      "net.default-gateway",
      "net.connectivity-verification",
      "net.fault-isolation"
    ]
  },
  {
    // Cumulative by construction. Its first question asks for the SINGLE fault
    // that explains three results at once, which requires holding trunking,
    // routing and verification simultaneously; its last asks why gateway
    // reachability does not prove inter-VLAN routing. That is integration
    // across modules 2, 3 and 4, not reinforcement of one mission.
    assessmentStableId: "ros-kc-fault-isolation",
    scope: "course_review",
    exercisesCompetencyStableIds: [
      "net.access-port-membership",
      "net.trunking-dot1q",
      "net.inter-vlan-routing",
      "net.connectivity-verification",
      "net.fault-isolation"
    ]
  }
];

/**
 * The authored missions in learning order.
 *
 * Module position first, then mission position within it. This is the one
 * ordering; `roas-course-content.ts` flattens the same way, and a test pins the
 * two together so a second ordering cannot appear unnoticed.
 */
export function roasMissionsInLearningOrder(): readonly RoasMissionNode[] {
  const modulePosition = new Map(
    ROAS_MODULES.map((module) => [module.stableId, module.position])
  );

  return [...ROAS_MISSIONS].sort((left, right) => {
    const byModule =
      (modulePosition.get(left.moduleStableId) ?? 0) -
      (modulePosition.get(right.moduleStableId) ?? 0);

    return byModule !== 0 ? byModule : left.position - right.position;
  });
}

export interface RoasResolvedPracticePlacement {
  assessmentStableId: string;
  scope: RoasPracticeScope;
  /**
   * The first mission at which every exercised competency has been required by
   * some mission at or before it. Null when no such mission exists, which
   * `validateRoasCurriculum` treats as an authoring error.
   */
  availableFromMissionStableId: string | null;
  /** Index into the authored learning order, or -1 when unavailable. */
  availableFromIndex: number;
}

/**
 * When each practice check becomes answerable.
 *
 * Derived entirely from the missions' own `competencies` declarations: a
 * competency is "developed" at the first mission that lists it as required, and
 * a check waits for the latest of the competencies it exercises.
 */
export function resolveRoasPracticePlacements(): readonly RoasResolvedPracticePlacement[] {
  const order = roasMissionsInLearningOrder();

  const developedAt = new Map<string, number>();
  order.forEach((mission, index) => {
    for (const link of mission.competencies) {
      if (!link.required) continue;
      if (!developedAt.has(link.competencyStableId)) {
        developedAt.set(link.competencyStableId, index);
      }
    }
  });

  return ROAS_PRACTICE_PLACEMENTS.map((placement) => {
    let latest = 0;
    let resolvable = true;

    for (const competencyStableId of placement.exercisesCompetencyStableIds) {
      const index = developedAt.get(competencyStableId);
      if (index === undefined) {
        resolvable = false;
        break;
      }
      latest = Math.max(latest, index);
    }

    return {
      assessmentStableId: placement.assessmentStableId,
      scope: placement.scope,
      availableFromMissionStableId: resolvable
        ? (order[latest]?.stableId ?? null)
        : null,
      availableFromIndex: resolvable ? latest : -1
    };
  });
}

/* ------------------------------------------------------------------ *
 * The lab and its deterministic validation profile
 *
 * Capabilities state requirements, never implementations. ROAS-1's
 * `PROVIDER_SPECIFIC_CAPABILITY_TOKENS` rejects a capability naming a product,
 * and `verify-roas2.sh` re-asserts the same prohibition against this content so
 * the two cannot drift apart.
 *
 * Every check below is a condition a machine can settle by inspection or by
 * test. There is deliberately no check for the learner's written explanation:
 * an explanation is not deterministically assessable, and inventing a check for
 * it is exactly how AI would end up adjudicating competency.
 * ------------------------------------------------------------------ */

export const ROAS_LAB_VALIDATION_PROFILE_STABLE_ID = "LABVP-ROAS-001";

export interface RoasValidationCheck {
  stableId: string;
  probeId: string;
  title: string;
  explanation: string;
  required: boolean;
  sortOrder: number;
}

export const ROAS_LAB_VALIDATION_CHECKS: readonly RoasValidationCheck[] = [
  {
    stableId: "LABCHK-ROAS-VLANS-DEFINED",
    probeId: "switch.vlan-database.contains",
    title: "VLAN 10 and VLAN 20 exist on the switch",
    explanation:
      "Both VLANs must exist before a port can join one. If this fails, the switch has no separate broadcast domains and every later condition depends on it.",
    required: true,
    sortOrder: 0
  },
  {
    stableId: "LABCHK-ROAS-ACCESS-PORTS",
    probeId: "switch.access-port.vlan-membership",
    title: "Each host's access port is in the VLAN matching its address range",
    explanation:
      "A port in the wrong VLAN places the host in a segment its address does not belong to. The host looks correctly configured and still cannot reach its own gateway.",
    required: true,
    sortOrder: 1
  },
  {
    stableId: "LABCHK-ROAS-TRUNK-CARRIES-BOTH",
    probeId: "switch.trunk.allowed-vlans",
    title: "The trunk to the router permits both VLAN 10 and VLAN 20",
    explanation:
      "A trunk permitting only one VLAN stays up and looks healthy while silently discarding the other. This is checked separately from the trunk existing, because the two fail differently.",
    required: true,
    sortOrder: 2
  },
  {
    stableId: "LABCHK-ROAS-SUBINTERFACE-TAGS",
    probeId: "router.subinterface.dot1q-tag",
    title: "Each router subinterface is bound to the correct VLAN tag",
    explanation:
      "A subinterface with the wrong tag is not reported as an error. It waits for traffic that never arrives while arriving traffic is dropped for having no interface that claims it.",
    required: true,
    sortOrder: 3
  },
  {
    stableId: "LABCHK-ROAS-GATEWAY-ADDRESSING",
    probeId: "router.subinterface.address",
    title: "Each subinterface holds the gateway address for its VLAN",
    explanation:
      "The subinterface must carry the address the hosts in that VLAN use as their default gateway, or off-subnet traffic has nowhere to go.",
    required: true,
    sortOrder: 4
  },
  {
    stableId: "LABCHK-ROAS-HOST-ADDRESSING",
    probeId: "host.address-and-gateway",
    title: "Each host holds its intended address, prefix length and default gateway",
    explanation:
      "The prefix length decides what the host attempts to deliver itself, and the gateway decides where everything else goes. Both must match the segment the host sits in.",
    required: true,
    sortOrder: 5
  },
  {
    stableId: "LABCHK-ROAS-GATEWAY-REACHABILITY",
    probeId: "host.icmp.gateway-reachability",
    title: "Each host reaches its own default gateway",
    explanation:
      "This proves the access port, the VLAN, the trunk for that VLAN and the matching subinterface all behave. It does not prove the other VLAN works.",
    required: true,
    sortOrder: 6
  },
  {
    stableId: "LABCHK-ROAS-INTER-VLAN-REACHABILITY",
    probeId: "host.icmp.cross-vlan-reachability",
    title: "PC-A and PC-B reach each other across the VLAN boundary",
    explanation:
      "The end-to-end condition. Reaching a host inside the other VLAN is what proves that VLAN crosses the trunk, unlike reaching a gateway address that the router answers locally.",
    required: true,
    sortOrder: 7
  },
  {
    stableId: "LABCHK-ROAS-SEGMENTATION-INTACT",
    probeId: "switch.access-port.no-shared-vlan",
    title: "The two hosts remain in separate VLANs",
    explanation:
      "Placing both hosts in one VLAN would make them reachable without any routing at all. That passes a naive reachability test while demonstrating none of the competency this lab exists to prove.",
    required: true,
    sortOrder: 8
  }
];

export const ROAS_LAB_DEFINITION: LabDefinition = {
  stableId: "LABDEF-ROAS-001",
  version: 1,
  name: "Router-on-a-Stick: Build and Prove the Network",
  description:
    "Build a two-VLAN network from a clean configuration: create the VLANs, assign access ports, trunk both VLANs to the router, add a correctly tagged and addressed subinterface per VLAN, and prove end-to-end reachability across the VLAN boundary.",
  missionStableId: "ros-m7-demonstrate",
  competencyStableIds: [
    "net.ip-addressing",
    "net.subnet-boundaries",
    "net.vlan-segmentation",
    "net.access-port-membership",
    "net.trunking-dot1q",
    "net.inter-vlan-routing",
    "net.default-gateway",
    "net.connectivity-verification",
    "net.fault-isolation"
  ],
  requiredCapabilities: [
    "isolated-network",
    "layer2-switching",
    "vlan-capable-switching",
    "dot1q-trunking",
    "layer3-routing-with-subinterfaces",
    "console-access",
    "deterministic-configuration-inspection",
    "deterministic-reachability-probe"
  ],
  resources: [
    { role: "edge-router", kind: "network_device", count: 1 },
    { role: "access-switch", kind: "network_device", count: 1 },
    { role: "pc-a-workstation", kind: "linux_node", count: 1 },
    { role: "pc-b-server", kind: "linux_node", count: 1 }
  ],
  accessMethods: ["terminal", "browser_console"],
  estimatedDurationMinutes: 60,
  sessionLimitMinutes: 120,
  validationProfileStableId: ROAS_LAB_VALIDATION_PROFILE_STABLE_ID,
  resetStrategy: "recreate",
  safety: {
    classification: "standard",
    internetAccessAllowed: false,
    outboundTrafficRestricted: true,
    privilegedAccessRequired: true,
    allowedNetworkScopes: [
      "lab-internal-vlan10",
      "lab-internal-vlan20",
      "lab-internal-transit"
    ],
    prohibitedContent: []
  },
  accessibility: {
    connectionMethods: ["terminal", "browser_console"],
    keyboardRequired: true,
    screenReaderLimitations: [],
    commandLineAlternativeAvailable: true,
    visualOnlyActivities: [],
    accommodations: ["extended-session-time-on-request"],
    timingIsEssentialCompetency: false
  },
  dataPersistencePolicy: "session",
  // Always draft. ROAS-1 authors into draft and reaches learners only through
  // `transitionLabDefinitionState`, which re-validates and checks that the
  // mission and every competency are already published.
  publicationState: "draft"
};

/* ------------------------------------------------------------------ *
 * Validation
 * ------------------------------------------------------------------ */

/** The curriculum stable-id grammar enforced by `curriculum-admin.ts`. */
const CURRICULUM_STABLE_ID = /^[a-z0-9][a-z0-9._-]{2,119}$/;

export interface RoasContentValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates the authored content against the invariants the server enforces.
 *
 * This deliberately re-uses `validateLabDefinition` and
 * `validateAssessmentDefinition` rather than reimplementing them: a local copy
 * would drift, and the whole point is that this content is publishable by the
 * real code paths.
 *
 * The structural rules mirror `validateLearningPathForPublication` and
 * `buildLearningPathQualityReport`, which between them reject a path with no
 * course, a course with no module, a module with no mission, a mission with no
 * required competency, duplicate positions, and negative effort metadata.
 */
export function validateRoasCurriculum(): RoasContentValidationResult {
  const errors: string[] = [];

  const competencyIds = new Set(ROAS_COMPETENCIES.map((c) => c.stableId));
  const moduleIds = new Set(ROAS_MODULES.map((m) => m.stableId));

  if (competencyIds.size !== ROAS_COMPETENCIES.length) {
    errors.push("competency stable ids must be unique");
  }
  if (moduleIds.size !== ROAS_MODULES.length) {
    errors.push("module stable ids must be unique");
  }

  const curriculumIds = [
    ROAS_COURSE.stableId,
    ...ROAS_MODULES.map((m) => m.stableId),
    ...ROAS_MISSIONS.map((m) => m.stableId),
    ...ROAS_COMPETENCIES.map((c) => c.stableId)
  ];

  for (const id of curriculumIds) {
    if (!CURRICULUM_STABLE_ID.test(id)) {
      errors.push(`stable id is not a valid curriculum identifier: ${id}`);
    }
  }

  // Competency identity must be domain-scoped so a later course can reference
  // it. This is the connected-learning guarantee, not a naming preference.
  for (const competency of ROAS_COMPETENCIES) {
    const scoped = ROAS_REUSABLE_COMPETENCY_DOMAIN_PREFIXES.some((prefix) =>
      competency.stableId.startsWith(prefix)
    );
    if (!scoped) {
      errors.push(
        `competency is not domain-scoped and could not be reused by a later course: ${competency.stableId}`
      );
    }

    const courseScoped = [
      ROAS_COURSE.stableId,
      ...ROAS_MODULES.map((m) => m.stableId),
      ...ROAS_MISSIONS.map((m) => m.stableId)
    ].some((node) => competency.stableId.includes(node));

    if (courseScoped) {
      errors.push(
        `competency identity embeds a course node and is not reusable: ${competency.stableId}`
      );
    }
  }

  if (ROAS_MODULES.length === 0) errors.push("the course must contain at least one module");

  const modulePositions = ROAS_MODULES.map((m) => m.position);
  if (new Set(modulePositions).size !== modulePositions.length) {
    errors.push("module positions must be unique within the course");
  }

  for (const module of ROAS_MODULES) {
    if (module.courseStableId !== ROAS_COURSE.stableId) {
      errors.push(`module references an unknown course: ${module.stableId}`);
    }
    if (module.estimatedMinutes < 0) {
      errors.push(`module effort metadata must not be negative: ${module.stableId}`);
    }

    const missions = ROAS_MISSIONS.filter(
      (mission) => mission.moduleStableId === module.stableId
    );

    if (missions.length === 0) {
      errors.push(`module contains no mission: ${module.stableId}`);
    }

    const positions = missions.map((mission) => mission.position);
    if (new Set(positions).size !== positions.length) {
      errors.push(`mission positions must be unique within module ${module.stableId}`);
    }
  }

  for (const mission of ROAS_MISSIONS) {
    if (!moduleIds.has(mission.moduleStableId)) {
      errors.push(`mission references an unknown module: ${mission.stableId}`);
    }
    if (!mission.title.trim()) {
      errors.push(`mission title is required: ${mission.stableId}`);
    }
    if (!mission.brief.trim()) {
      errors.push(`mission brief is required: ${mission.stableId}`);
    }
    if (mission.estimatedMinutes < 0) {
      errors.push(`mission effort metadata must not be negative: ${mission.stableId}`);
    }

    const required = mission.competencies.filter((link) => link.required);
    if (required.length === 0) {
      errors.push(
        `mission maps to no required competency and would block publication: ${mission.stableId}`
      );
    }

    const linked = mission.competencies.map((link) => link.competencyStableId);
    if (new Set(linked).size !== linked.length) {
      errors.push(`mission links the same competency twice: ${mission.stableId}`);
    }

    for (const link of mission.competencies) {
      if (!competencyIds.has(link.competencyStableId)) {
        errors.push(
          `mission ${mission.stableId} references an unknown competency: ${link.competencyStableId}`
        );
      }
    }
  }

  // Every authored competency must be taught somewhere, or it is a competency
  // the learner can never demonstrate.
  const linkedCompetencies = new Set(
    ROAS_MISSIONS.flatMap((mission) =>
      mission.competencies.map((link) => link.competencyStableId)
    )
  );
  for (const competency of ROAS_COMPETENCIES) {
    if (!linkedCompetencies.has(competency.stableId)) {
      errors.push(`competency is never mapped to a mission: ${competency.stableId}`);
    }
  }

  for (const edge of ROAS_COMPETENCY_PREREQUISITES) {
    if (!competencyIds.has(edge.competencyStableId)) {
      errors.push(`prerequisite references an unknown competency: ${edge.competencyStableId}`);
    }
    if (!competencyIds.has(edge.prerequisiteCompetencyStableId)) {
      errors.push(
        `prerequisite references an unknown prerequisite: ${edge.prerequisiteCompetencyStableId}`
      );
    }
    if (edge.competencyStableId === edge.prerequisiteCompetencyStableId) {
      errors.push(`a competency cannot require itself: ${edge.competencyStableId}`);
    }
  }

  if (hasCompetencyPrerequisiteCycle()) {
    errors.push("the competency prerequisite graph contains a cycle");
  }

  // The lab must terminate the course and settle it deterministically.
  const labValidation = validateLabDefinition(ROAS_LAB_DEFINITION);
  if (!labValidation.valid) {
    for (const error of labValidation.errors) {
      errors.push(`lab definition: ${error}`);
    }
  }

  if (!ROAS_MISSIONS.some((m) => m.stableId === ROAS_LAB_DEFINITION.missionStableId)) {
    errors.push("the lab definition references a mission outside this course");
  }

  for (const competencyStableId of ROAS_LAB_DEFINITION.competencyStableIds) {
    if (!competencyIds.has(competencyStableId)) {
      errors.push(`the lab references an unknown competency: ${competencyStableId}`);
    }
  }

  if (ROAS_LAB_DEFINITION.validationProfileStableId !== ROAS_LAB_VALIDATION_PROFILE_STABLE_ID) {
    errors.push("the lab references a validation profile that is not authored here");
  }

  const requiredChecks = ROAS_LAB_VALIDATION_CHECKS.filter((check) => check.required);
  if (requiredChecks.length === 0) {
    errors.push("the validation profile has no required check and could not be published");
  }

  const checkIds = new Set(ROAS_LAB_VALIDATION_CHECKS.map((check) => check.stableId));
  if (checkIds.size !== ROAS_LAB_VALIDATION_CHECKS.length) {
    errors.push("validation check stable ids must be unique");
  }

  for (const check of ROAS_LAB_VALIDATION_CHECKS) {
    if (!/^LABCHK-[A-Z0-9][A-Z0-9-]*$/.test(check.stableId)) {
      errors.push(`validation check id is not a stable LABCHK identifier: ${check.stableId}`);
    }
    if (!check.probeId.trim()) {
      errors.push(`validation check has no probe: ${check.stableId}`);
    }
    if (!check.explanation.trim()) {
      errors.push(`validation check has no learner explanation: ${check.stableId}`);
    }
  }

  // Knowledge checks support learning; they never settle a competency claim.
  const assessmentIds = new Set(ROAS_KNOWLEDGE_CHECKS.map((a) => a.stableId));
  if (assessmentIds.size !== ROAS_KNOWLEDGE_CHECKS.length) {
    errors.push("knowledge check stable ids must be unique");
  }

  for (const assessment of ROAS_KNOWLEDGE_CHECKS) {
    for (const error of validateAssessmentDefinition(assessment)) {
      errors.push(`knowledge check ${assessment.stableId}: ${error}`);
    }

    if (assessment.purpose !== "practice") {
      errors.push(
        `knowledge check must be practice-purpose so it cannot substitute for deterministic validation: ${assessment.stableId}`
      );
    }

    if (assessment.competencyMappings.length > 0) {
      errors.push(
        `knowledge check must not map to a competency: ${assessment.stableId}`
      );
    }

    for (const question of assessment.questions) {
      const optionIds = new Set(question.options.map((option) => option.id));
      if (optionIds.size !== question.options.length) {
        errors.push(`question has duplicate option ids: ${question.stableId}`);
      }
      for (const correct of question.correctOptionIds) {
        if (!optionIds.has(correct)) {
          errors.push(
            `question marks an option correct that it does not offer: ${question.stableId}`
          );
        }
      }
      if (question.correctOptionIds.length >= question.options.length) {
        errors.push(`every option cannot be correct: ${question.stableId}`);
      }
    }
  }

  // PRACTICE-ARCH-1 — every check is placed, and every placement is real.
  const placeableCheckIds = new Set(
    ROAS_KNOWLEDGE_CHECKS.map((check) => check.stableId)
  );
  const placedIds = new Set(
    ROAS_PRACTICE_PLACEMENTS.map((placement) => placement.assessmentStableId)
  );

  for (const check of ROAS_KNOWLEDGE_CHECKS) {
    if (!placedIds.has(check.stableId)) {
      errors.push(
        `knowledge check has no practice placement, so the learner surface cannot know where it belongs: ${check.stableId}`
      );
    }
  }

  for (const placement of ROAS_PRACTICE_PLACEMENTS) {
    if (!placeableCheckIds.has(placement.assessmentStableId)) {
      errors.push(
        `practice placement references an unknown knowledge check: ${placement.assessmentStableId}`
      );
    }

    if (placement.exercisesCompetencyStableIds.length === 0) {
      errors.push(
        `practice placement exercises no competency, so it can never become answerable: ${placement.assessmentStableId}`
      );
    }

    for (const competencyStableId of placement.exercisesCompetencyStableIds) {
      if (!competencyIds.has(competencyStableId)) {
        errors.push(
          `practice placement references an unknown competency: ${competencyStableId}`
        );
      }
    }
  }

  for (const resolved of resolveRoasPracticePlacements()) {
    if (resolved.availableFromMissionStableId === null) {
      errors.push(
        `practice exercises a competency no mission ever requires, so it would never become answerable: ${resolved.assessmentStableId}`
      );
    }
  }

  return { valid: errors.length === 0, errors };
}

/** Depth-first cycle detection over the authored prerequisite edges. */
export function hasCompetencyPrerequisiteCycle(): boolean {
  const edges = new Map<string, string[]>();
  for (const edge of ROAS_COMPETENCY_PREREQUISITES) {
    const existing = edges.get(edge.competencyStableId) ?? [];
    existing.push(edge.prerequisiteCompetencyStableId);
    edges.set(edge.competencyStableId, existing);
  }

  const visiting = new Set<string>();
  const settled = new Set<string>();

  function walk(node: string): boolean {
    if (visiting.has(node)) return true;
    if (settled.has(node)) return false;

    visiting.add(node);
    for (const next of edges.get(node) ?? []) {
      if (walk(next)) return true;
    }
    visiting.delete(node);
    settled.add(node);
    return false;
  }

  for (const node of edges.keys()) {
    if (walk(node)) return true;
  }

  return false;
}

/* ------------------------------------------------------------------ *
 * Authoring plan
 *
 * ROAS-2 authors content; it does not write it. This derives the ordered
 * sequence of EXISTING Founder-guarded operations that would.
 *
 * The ordering is not cosmetic. Publishing the learning path cascades through
 * `curriculum_publish_learning_path_tree`, which publishes courses, modules,
 * missions and every linked competency. `transitionLabDefinitionState` refuses
 * to publish a lab whose mission or competencies are not already published. The
 * curriculum must therefore publish BEFORE the lab, and a plan that got that
 * backwards would fail against the real server.
 * ------------------------------------------------------------------ */

export type RoasAuthoringOperationKind =
  | "create_learning_path"
  | "create_course"
  | "create_module"
  | "create_mission"
  | "create_competency"
  | "add_competency_prerequisite"
  | "link_mission_competency"
  | "validate_learning_path"
  | "publish_learning_path"
  | "create_lab_definition"
  | "add_lab_validation_checks"
  | "publish_lab_validation_profile"
  | "publish_lab_definition";

export interface RoasAuthoringOperation {
  order: number;
  kind: RoasAuthoringOperationKind;
  /** An operation that already exists in `curriculum-admin.ts` or `lab-admin.ts`. */
  adminFunction: string;
  /** The Founder-guarded route that already exposes it. */
  route: string;
  /** What this operation acts on. */
  subject: string;
}

export function buildRoasAuthoringPlan(): RoasAuthoringOperation[] {
  const operations: Omit<RoasAuthoringOperation, "order">[] = [];

  operations.push({
    kind: "create_learning_path",
    adminFunction: "createDraftLearningPath",
    route: "POST /admin/curriculum/learning-paths",
    subject: ROAS_LEARNING_PATH_STABLE_ID
  });

  operations.push({
    kind: "create_course",
    adminFunction: "createDraftCourse",
    route: "POST /admin/curriculum/courses",
    subject: ROAS_COURSE.stableId
  });

  for (const module of [...ROAS_MODULES].sort((a, b) => a.position - b.position)) {
    operations.push({
      kind: "create_module",
      adminFunction: "createDraftModule",
      route: "POST /admin/curriculum/modules",
      subject: module.stableId
    });
  }

  for (const mission of ROAS_MISSIONS) {
    operations.push({
      kind: "create_mission",
      adminFunction: "createDraftMission",
      route: "POST /admin/curriculum/missions",
      subject: mission.stableId
    });
  }

  for (const competency of ROAS_COMPETENCIES) {
    operations.push({
      kind: "create_competency",
      adminFunction: "createDraftCompetency",
      route: "POST /admin/curriculum/competencies",
      subject: competency.stableId
    });
  }

  for (const edge of ROAS_COMPETENCY_PREREQUISITES) {
    operations.push({
      kind: "add_competency_prerequisite",
      adminFunction: "addCompetencyPrerequisite",
      route: "POST /admin/curriculum/competency-prerequisites",
      subject: `${edge.competencyStableId} requires ${edge.prerequisiteCompetencyStableId}`
    });
  }

  for (const mission of ROAS_MISSIONS) {
    for (const link of mission.competencies) {
      operations.push({
        kind: "link_mission_competency",
        adminFunction: "linkMissionCompetency",
        route: "POST /admin/curriculum/mission-competencies",
        subject: `${mission.stableId} -> ${link.competencyStableId}`
      });
    }
  }

  operations.push({
    kind: "validate_learning_path",
    adminFunction: "validateLearningPathForPublication",
    route: "POST /admin/curriculum/learning-paths/{id}/validate",
    subject: ROAS_LEARNING_PATH_STABLE_ID
  });

  // Publishing the path cascades to courses, modules, missions and competencies.
  operations.push({
    kind: "publish_learning_path",
    adminFunction: "transitionLearningPathState",
    route: "POST /admin/curriculum/learning-paths/{id}/transition",
    subject: ROAS_LEARNING_PATH_STABLE_ID
  });

  // Only now can the lab publish: its mission and competencies exist published.
  operations.push({
    kind: "create_lab_definition",
    adminFunction: "createDraftLabDefinition",
    route: "POST /admin/labs/definitions",
    subject: ROAS_LAB_DEFINITION.stableId
  });

  operations.push({
    kind: "add_lab_validation_checks",
    adminFunction: "addLabValidationChecks",
    route: "POST /admin/labs/validation-checks",
    subject: ROAS_LAB_VALIDATION_PROFILE_STABLE_ID
  });

  operations.push({
    kind: "publish_lab_validation_profile",
    adminFunction: "transitionLabValidationProfileState",
    route: "POST /admin/labs/validation-profiles/{profileStableId}/state",
    subject: ROAS_LAB_VALIDATION_PROFILE_STABLE_ID
  });

  operations.push({
    kind: "publish_lab_definition",
    adminFunction: "transitionLabDefinitionState",
    route: "POST /admin/labs/definitions/{stableId}/{version}/state",
    subject: ROAS_LAB_DEFINITION.stableId
  });

  return operations.map((operation, index) => ({ order: index, ...operation }));
}
