import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * ROAS-1 — Founder-guarded Lab Definition and validation-check authoring.
 *
 * The client factory is mocked using the CERT-005 precedent, so the write shape,
 * the publication gates and the reference checks can be exercised without a
 * database.
 *
 * NOT proven here: real RLS. Authoring writes through the service-role client by
 * design — exactly as `curriculum-admin.ts` and `certificate-admin.ts` do — so
 * the protection is the Founder route guard, which is asserted structurally
 * below and by the API smoke test, not by a database policy.
 */
vi.mock("./supabase", () => ({
  createUserScopedSupabaseClient: vi.fn(),
  createServerSupabaseClient: vi.fn()
}));

function read(relativePath: string): string {
  return readFileSync(new URL(relativePath, import.meta.url), "utf8");
}

function stripTsComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !/^\s*\/\//.test(line))
    .join("\n");
}

const adminSource = read("./lab-admin.ts");
const adminCode = stripTsComments(adminSource);
const server = read("./server.ts");

const ACTOR = { actorUserId: "11111111-1111-4111-8111-111111111111" };

function validDefinitionInput(overrides: Record<string, unknown> = {}) {
  return {
    stableId: "LABDEF-NET-ROAS-001",
    name: "Router-on-a-Stick: inter-VLAN routing",
    description: "Configure and verify inter-VLAN connectivity.",
    missionStableId: "mission.roas.configure",
    competencyStableIds: ["competency.vlan-segmentation"],
    requiredCapabilities: ["isolated-network", "console-access"],
    resources: [{ role: "router", kind: "network_device", count: 1 }],
    accessMethods: ["terminal"],
    estimatedDurationMinutes: 45,
    sessionLimitMinutes: 90,
    validationProfileStableId: "LABVP-NET-ROAS-001",
    resetStrategy: "recreate",
    safety: {
      classification: "standard",
      internetAccessAllowed: false,
      outboundTrafficRestricted: true,
      privilegedAccessRequired: true,
      allowedNetworkScopes: ["lab-internal"],
      prohibitedContent: []
    },
    accessibility: {
      connectionMethods: ["terminal"],
      keyboardRequired: true,
      screenReaderLimitations: [],
      commandLineAlternativeAvailable: true,
      visualOnlyActivities: [],
      accommodations: [],
      timingIsEssentialCompetency: false
    },
    dataPersistencePolicy: "ephemeral",
    ...overrides
  };
}

/**
 * Chainable stand-in that records writes and returns per-table rows.
 *
 * `select()` after `insert`/`update` resolves; a bare `select()` chain resolves
 * through the terminal operator the code actually uses.
 */
function client(byTable: Record<string, unknown[]> = {}) {
  const inserts: Array<{ table: string; rows: unknown }> = [];
  const updates: Array<{ table: string; values: unknown }> = [];
  const reads: string[] = [];

  /**
   * The builder is THENABLE, because the real code awaits some chains directly
   * (`.select().eq().eq()`) and terminates others with `.maybeSingle()` or
   * `.single()`. A harness that only resolved at `.limit()` would not match the
   * shapes the implementation actually uses.
   */
  const make = (table: string) => {
    const builder: Record<string, unknown> = {};
    let mode: "read" | "insert" | "update" = "read";
    let payload: unknown = null;

    const rowsFor = (): unknown[] => {
      if (mode === "insert" && !(table in byTable)) {
        return Array.isArray(payload) ? payload : [payload];
      }
      return byTable[table] ?? [];
    };

    const settle = () => ({ data: rowsFor(), error: null });

    builder.insert = (rows: unknown) => {
      mode = "insert";
      payload = rows;
      inserts.push({ table, rows });
      return builder;
    };
    builder.update = (values: unknown) => {
      mode = "update";
      payload = values;
      updates.push({ table, values });
      return builder;
    };
    builder.select = () => {
      if (mode === "read") reads.push(table);
      return builder;
    };
    builder.eq = () => builder;
    builder.order = () => builder;
    builder.limit = () => builder;
    builder.maybeSingle = (): Promise<unknown> =>
      Promise.resolve({ data: rowsFor()[0] ?? null, error: null });
    builder.single = (): Promise<unknown> =>
      Promise.resolve({ data: rowsFor()[0] ?? null, error: null });
    builder.then = (
      resolve: (value: unknown) => unknown,
      reject?: (reason: unknown) => unknown
    ) => Promise.resolve(settle()).then(resolve, reject);

    return builder;
  };

  return {
    factory: () => ({ from: (table: string) => make(table) }),
    inserts,
    updates,
    reads
  };
}

async function withClient(byTable: Record<string, unknown[]> = {}) {
  const { createServerSupabaseClient } = await import("./supabase");
  const harness = client(byTable);
  vi.mocked(createServerSupabaseClient).mockImplementation(
    harness.factory as never
  );
  return harness;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.resetModules();
});

// ---------------------------------------------------------------------------
// A. Founder authorization
// ---------------------------------------------------------------------------

describe("A: authoring is Founder-guarded and fails closed", () => {
  it("A1: every lab authoring route requires the Founder guard", () => {
    const routes = [
      '"/admin/labs/definitions"',
      '"/admin/labs/validation-checks"',
      "admin\\/labs\\/definitions\\/([^/]+)\\/([0-9]+)\\/state",
      "admin\\/labs\\/validation-profiles\\/([^/]+)\\/state"
    ];

    for (const route of routes) {
      const at = server.indexOf(route);
      expect(at, `route missing: ${route}`).toBeGreaterThan(-1);
      // The guard must appear within the handler that follows the route match.
      const handler = server.slice(at, at + 400);
      expect(handler, `unguarded route: ${route}`).toContain(
        "await founder(request)"
      );
    }
  });

  it("A2: no lab authoring route uses the plain authenticated identity", () => {
    const block = server.slice(
      server.indexOf('"/admin/labs/definitions"'),
      server.indexOf('"/admin/curriculum/learning-paths"')
    );

    expect(block).not.toContain("resolveTrustedRequestIdentity(request)");
  });

  it("A3: an authoring call without an actor is refused", async () => {
    await withClient();
    const { createDraftLabDefinition } = await import("./lab-admin");

    await expect(
      createDraftLabDefinition({ actorUserId: "" }, validDefinitionInput())
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });
});

// ---------------------------------------------------------------------------
// B. Authoring performs no provider work
// ---------------------------------------------------------------------------

describe("B: authoring never touches infrastructure", () => {
  it("B1: imports no provider, registry or session module", () => {
    for (const forbidden of [
      "lab-provider-registry",
      "lab-provider-selection",
      "mock-lab-provider",
      "container-lab-provider",
      "lab-sessions",
      "lab-runtime",
      "container-runtime"
    ]) {
      expect(adminCode).not.toContain(forbidden);
    }
  });

  it("B2: performs no provisioning or session operation", () => {
    for (const forbidden of [
      "provision(",
      ".start(",
      ".destroy(",
      "runValidationProbe",
      "chooseLabProvider",
      "getLabProvider"
    ]) {
      expect(adminCode).not.toContain(forbidden);
    }
  });

  it("B3: creating a draft writes only lab metadata", async () => {
    const harness = await withClient();
    const { createDraftLabDefinition } = await import("./lab-admin");

    await createDraftLabDefinition(ACTOR, validDefinitionInput());

    expect(harness.inserts.map((entry) => entry.table)).toEqual([
      "lab_definitions"
    ]);
  });

  it("B4: contains no AI dependency", () => {
    expect(adminCode).not.toMatch(/openai|anthropic|ollama|embedding/i);
  });
});

// ---------------------------------------------------------------------------
// C. Provider neutrality
// ---------------------------------------------------------------------------

describe("C: provider-specific detail cannot enter lab metadata", () => {
  it("C1: rejects a capability naming a provider or product", async () => {
    await withClient();
    const { createDraftLabDefinition } = await import("./lab-admin");

    for (const capability of [
      "proxmox",
      "proxmox-node-r620-2",
      "requires-docker",
      "kvm_host",
      "run-on-esxi",
      "aws-vpc"
    ]) {
      await expect(
        createDraftLabDefinition(
          ACTOR,
          validDefinitionInput({
            requiredCapabilities: ["isolated-network", capability]
          })
        ),
        capability
      ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
    }
  });

  it("C2: accepts capability-shaped requirements", async () => {
    await withClient();
    const { createDraftLabDefinition } = await import("./lab-admin");

    await expect(
      createDraftLabDefinition(
        ACTOR,
        validDefinitionInput({
          requiredCapabilities: ["isolated-network", "console-access", "linux"]
        })
      )
    ).resolves.toMatchObject({ publicationState: "draft" });
  });

  it("C3: holds the provider-token prohibition as data", async () => {
    const { PROVIDER_SPECIFIC_CAPABILITY_TOKENS } = await import("./lab-admin");

    for (const token of ["proxmox", "hypervisor", "esxi", "docker", "kvm"]) {
      expect(PROVIDER_SPECIFIC_CAPABILITY_TOKENS).toContain(token);
    }
  });
});

// ---------------------------------------------------------------------------
// D. Definition validity
// ---------------------------------------------------------------------------

describe("D: malformed definitions are refused before any write", () => {
  it("D1: rejects a non-LABDEF stable id", async () => {
    const harness = await withClient();
    const { createDraftLabDefinition } = await import("./lab-admin");

    await expect(
      createDraftLabDefinition(
        ACTOR,
        validDefinitionInput({ stableId: "net-roas-001" })
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(harness.inserts).toHaveLength(0);
  });

  it("D2: rejects a definition with no competency", async () => {
    const harness = await withClient();
    const { createDraftLabDefinition } = await import("./lab-admin");

    await expect(
      createDraftLabDefinition(
        ACTOR,
        validDefinitionInput({ competencyStableIds: [] })
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(harness.inserts).toHaveLength(0);
  });

  it("D3: rejects contradictory session timing", async () => {
    await withClient();
    const { createDraftLabDefinition } = await import("./lab-admin");

    await expect(
      createDraftLabDefinition(
        ACTOR,
        validDefinitionInput({
          estimatedDurationMinutes: 90,
          sessionLimitMinutes: 30
        })
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("D4: rejects an unapproved reset strategy or access method", async () => {
    await withClient();
    const { createDraftLabDefinition } = await import("./lab-admin");

    await expect(
      createDraftLabDefinition(
        ACTOR,
        validDefinitionInput({ resetStrategy: "delete-everything" })
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    await expect(
      createDraftLabDefinition(
        ACTOR,
        validDefinitionInput({ accessMethods: ["telnet"] })
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("D5: requires explicit safety network scopes", async () => {
    await withClient();
    const { createDraftLabDefinition } = await import("./lab-admin");

    await expect(
      createDraftLabDefinition(
        ACTOR,
        validDefinitionInput({
          safety: { ...validDefinitionInput().safety, allowedNetworkScopes: [] }
        })
      )
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("D6: always creates in draft, never published", async () => {
    const harness = await withClient();
    const { createDraftLabDefinition } = await import("./lab-admin");

    await createDraftLabDefinition(
      ACTOR,
      validDefinitionInput({ publicationState: "published" } as never)
    );

    const row = (harness.inserts[0]?.rows ?? {}) as Record<string, unknown>;
    expect(row.publication_state).toBe("draft");
  });

  it("D7: versions a repeated stable id rather than colliding", async () => {
    const harness = await withClient({ lab_definitions: [{ version: 3 }] });
    const { createDraftLabDefinition } = await import("./lab-admin");

    await createDraftLabDefinition(ACTOR, validDefinitionInput());

    const row = (harness.inserts[0]?.rows ?? {}) as Record<string, unknown>;
    expect(row.version).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// E. Validation checks preserve deterministic semantics
// ---------------------------------------------------------------------------

describe("E: validation checks stay deterministic and explainable", () => {
  const check = (overrides: Record<string, unknown> = {}) => ({
    stableId: "LABCHK-VLAN-EXISTS",
    probeId: "net.vlan.exists:10",
    title: "VLAN 10 exists",
    explanation: "The access VLAN for the workstation segment must be created.",
    required: true,
    ...overrides
  });

  it("E1: adds checks to a profile in draft", async () => {
    const harness = await withClient();
    const { addLabValidationChecks } = await import("./lab-admin");

    await addLabValidationChecks(ACTOR, {
      profileStableId: "LABVP-NET-ROAS-001",
      checks: [check()]
    });

    const rows = harness.inserts[0]?.rows as Record<string, unknown>[];
    expect(harness.inserts[0]?.table).toBe("lab_validation_checks");
    expect(rows[0]?.publication_state).toBe("draft");
    expect(rows[0]?.probe_id).toBe("net.vlan.exists:10");
  });

  it("E2: requires a learner-facing explanation", async () => {
    await withClient();
    const { addLabValidationChecks } = await import("./lab-admin");

    await expect(
      addLabValidationChecks(ACTOR, {
        profileStableId: "LABVP-NET-ROAS-001",
        checks: [check({ explanation: "  " })]
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("E3: requires a probe id — authoring never decides the answer", async () => {
    await withClient();
    const { addLabValidationChecks } = await import("./lab-admin");

    await expect(
      addLabValidationChecks(ACTOR, {
        profileStableId: "LABVP-NET-ROAS-001",
        checks: [check({ probeId: "" })]
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("E4: stores the probe id verbatim and never interprets it", async () => {
    const harness = await withClient();
    const { addLabValidationChecks } = await import("./lab-admin");

    await addLabValidationChecks(ACTOR, {
      profileStableId: "LABVP-NET-ROAS-001",
      checks: [check({ probeId: "fail:net.gateway.reachable" })]
    });

    const rows = harness.inserts[0]?.rows as Record<string, unknown>[];
    expect(rows[0]?.probe_id).toBe("fail:net.gateway.reachable");
    expect(adminCode).not.toContain("passed");
  });

  it("E5: rejects duplicate check identities in one request", async () => {
    const harness = await withClient();
    const { addLabValidationChecks } = await import("./lab-admin");

    await expect(
      addLabValidationChecks(ACTOR, {
        profileStableId: "LABVP-NET-ROAS-001",
        checks: [check(), check()]
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });

    expect(harness.inserts).toHaveLength(0);
  });

  it("E6: rejects an empty check set", async () => {
    await withClient();
    const { addLabValidationChecks } = await import("./lab-admin");

    await expect(
      addLabValidationChecks(ACTOR, {
        profileStableId: "LABVP-NET-ROAS-001",
        checks: []
      })
    ).rejects.toMatchObject({ code: "VALIDATION_ERROR" });
  });

  it("E7: defaults a check to required", async () => {
    const harness = await withClient();
    const { addLabValidationChecks } = await import("./lab-admin");

    await addLabValidationChecks(ACTOR, {
      profileStableId: "LABVP-NET-ROAS-001",
      checks: [{ ...check(), required: undefined }]
    });

    const rows = harness.inserts[0]?.rows as Record<string, unknown>[];
    expect(rows[0]?.required).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F. Publication gates
// ---------------------------------------------------------------------------

describe("F: publication is gated on curriculum and validation reality", () => {
  const publishedDefinitionRow = (overrides: Record<string, unknown> = {}) => ({
    stable_id: "LABDEF-NET-ROAS-001",
    version: 1,
    name: "Router-on-a-Stick",
    description: "",
    mission_stable_id: "mission.roas.configure",
    competency_stable_ids: ["competency.vlan-segmentation"],
    required_capabilities: ["isolated-network"],
    resources: [{ role: "router", kind: "network_device", count: 1 }],
    access_methods: ["terminal"],
    estimated_duration_minutes: 45,
    session_limit_minutes: 90,
    validation_profile_stable_id: "LABVP-NET-ROAS-001",
    reset_strategy: "recreate",
    safety: {
      classification: "standard",
      internetAccessAllowed: false,
      outboundTrafficRestricted: true,
      privilegedAccessRequired: true,
      allowedNetworkScopes: ["lab-internal"],
      prohibitedContent: []
    },
    accessibility: {
      connectionMethods: ["terminal"],
      keyboardRequired: true,
      screenReaderLimitations: [],
      commandLineAlternativeAvailable: true,
      visualOnlyActivities: [],
      accommodations: [],
      timingIsEssentialCompetency: false
    },
    data_persistence_policy: "ephemeral",
    publication_state: "review",
    ...overrides
  });

  it("F1: refuses draft -> published; review is where the Founder looks", async () => {
    await withClient({
      lab_definitions: [publishedDefinitionRow({ publication_state: "draft" })]
    });
    const { transitionLabDefinitionState } = await import("./lab-admin");

    await expect(
      transitionLabDefinitionState(ACTOR, "LABDEF-NET-ROAS-001", 1, "published")
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("F2: refuses publication when the mission is not published", async () => {
    await withClient({
      lab_definitions: [publishedDefinitionRow()],
      missions: [],
      competencies: [{ stable_id: "competency.vlan-segmentation" }],
      lab_validation_checks: [{ stable_id: "LABCHK-A", required: true }]
    });
    const { transitionLabDefinitionState } = await import("./lab-admin");

    await expect(
      transitionLabDefinitionState(ACTOR, "LABDEF-NET-ROAS-001", 1, "published")
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("F3: refuses publication when a competency is not published", async () => {
    await withClient({
      lab_definitions: [publishedDefinitionRow()],
      missions: [{ stable_id: "mission.roas.configure" }],
      competencies: [],
      lab_validation_checks: [{ stable_id: "LABCHK-A", required: true }]
    });
    const { transitionLabDefinitionState } = await import("./lab-admin");

    await expect(
      transitionLabDefinitionState(ACTOR, "LABDEF-NET-ROAS-001", 1, "published")
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  /** A lab with no required check could be "passed" without demonstrating anything. */
  it("F4: refuses publication without a published required check", async () => {
    await withClient({
      lab_definitions: [publishedDefinitionRow()],
      missions: [{ stable_id: "mission.roas.configure" }],
      competencies: [{ stable_id: "competency.vlan-segmentation" }],
      lab_validation_checks: []
    });
    const { transitionLabDefinitionState } = await import("./lab-admin");

    await expect(
      transitionLabDefinitionState(ACTOR, "LABDEF-NET-ROAS-001", 1, "published")
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("F5: publishes when every reference resolves", async () => {
    await withClient({
      lab_definitions: [publishedDefinitionRow()],
      missions: [{ stable_id: "mission.roas.configure" }],
      competencies: [{ stable_id: "competency.vlan-segmentation" }],
      lab_validation_checks: [{ stable_id: "LABCHK-A", required: true }]
    });
    const { transitionLabDefinitionState } = await import("./lab-admin");

    await expect(
      transitionLabDefinitionState(ACTOR, "LABDEF-NET-ROAS-001", 1, "published")
    ).resolves.toMatchObject({ stableId: "LABDEF-NET-ROAS-001" });
  });

  it("F6: reports a missing definition as NOT_FOUND", async () => {
    await withClient({ lab_definitions: [] });
    const { transitionLabDefinitionState } = await import("./lab-admin");

    await expect(
      transitionLabDefinitionState(ACTOR, "LABDEF-NET-ROAS-001", 1, "review")
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("F7: pins the approved lab publication lifecycle", async () => {
    const { isValidLabPublicationTransition } = await import("./lab-admin");

    expect(isValidLabPublicationTransition("draft", "review")).toBe(true);
    expect(isValidLabPublicationTransition("review", "published")).toBe(true);
    expect(isValidLabPublicationTransition("published", "retired")).toBe(true);
    expect(isValidLabPublicationTransition("draft", "published")).toBe(false);
    expect(isValidLabPublicationTransition("published", "draft")).toBe(false);
    expect(isValidLabPublicationTransition("retired", "published")).toBe(false);
  });

  it("F8: a profile transitions as a whole, never half-published", async () => {
    const harness = await withClient({
      lab_validation_checks: [
        { stable_id: "LABCHK-A", publication_state: "review" },
        { stable_id: "LABCHK-B", publication_state: "review" }
      ]
    });
    const { transitionLabValidationProfileState } = await import("./lab-admin");

    await transitionLabValidationProfileState(
      ACTOR,
      "LABVP-NET-ROAS-001",
      "published"
    );

    expect(harness.updates).toHaveLength(1);
    expect(harness.updates[0]?.table).toBe("lab_validation_checks");
  });

  it("F9: refuses an invalid profile transition", async () => {
    await withClient({
      lab_validation_checks: [
        { stable_id: "LABCHK-A", publication_state: "draft" }
      ]
    });
    const { transitionLabValidationProfileState } = await import("./lab-admin");

    await expect(
      transitionLabValidationProfileState(
        ACTOR,
        "LABVP-NET-ROAS-001",
        "published"
      )
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("F10: reports an unknown profile as NOT_FOUND", async () => {
    await withClient({ lab_validation_checks: [] });
    const { transitionLabValidationProfileState } = await import("./lab-admin");

    await expect(
      transitionLabValidationProfileState(ACTOR, "LABVP-UNKNOWN", "review")
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ---------------------------------------------------------------------------
// G. No schema change and no regression
// ---------------------------------------------------------------------------

describe("G: authoring introduces no new persistence surface", () => {
  it("G1: writes only to the two Wave 6 lab tables", () => {
    const literalTables = [
      ...new Set(
        [...adminCode.matchAll(/\.from\("([a-z_]+)"\)/g)].map(
          (match) => match[1]
        )
      )
    ].sort();

    expect(literalTables).toEqual(["lab_definitions", "lab_validation_checks"]);
  });

  /**
   * The only non-literal `.from(table)` is the curriculum reference check, and
   * its parameter is a closed union so it can never reach another table.
   */
  it("G1b: the curriculum read is restricted to a closed table union", () => {
    expect(adminCode).toContain('table: "missions" | "competencies"');
    expect(adminCode).toContain(".from(table)");
  });

  it("G2: performs no destructive operation", () => {
    for (const forbidden of [".delete(", ".rpc(", "drop ", "truncate"]) {
      expect(adminCode.toLowerCase()).not.toContain(forbidden);
    }
  });

  it("G3: reads curriculum only to confirm published references", () => {
    expect(adminCode).toContain('.eq("publication_state", "published")');
  });
});
