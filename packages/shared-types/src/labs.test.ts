import { describe, expect, it } from "vitest";
import { validateLabDefinition, type LabDefinition } from "./labs";

const valid: LabDefinition = {
  stableId: "LABDEF-LINUX-001", version: 1, name: "Linux baseline", description: "Practice Linux administration",
  missionStableId: "MISSION-LINUX-001", competencyStableIds: ["COMP-LINUX-001"], requiredCapabilities: ["isolated-network", "linux"],
  resources: [{ role: "student-node", kind: "linux_node", count: 1 }], accessMethods: ["ssh"], estimatedDurationMinutes: 30,
  sessionLimitMinutes: 60, validationProfileStableId: "LABVAL-LINUX-001", resetStrategy: "recreate",
  safety: { classification: "standard", internetAccessAllowed: false, outboundTrafficRestricted: true, privilegedAccessRequired: false, allowedNetworkScopes: ["session-only"], prohibitedContent: [] },
  accessibility: { connectionMethods: ["ssh"], keyboardRequired: true, screenReaderLimitations: [], commandLineAlternativeAvailable: true, visualOnlyActivities: [], accommodations: [], timingIsEssentialCompetency: false },
  dataPersistencePolicy: "ephemeral", publicationState: "draft"
};

describe("lab definition contract", () => {
  it("accepts a provider-independent complete definition", () => expect(validateLabDefinition(valid)).toEqual({ valid: true, errors: [] }));
  it("rejects incomplete safety/capability metadata", () => {
    const result = validateLabDefinition({ ...valid, requiredCapabilities: [], safety: { ...valid.safety, allowedNetworkScopes: [] } });
    expect(result.valid).toBe(false); expect(result.errors.length).toBeGreaterThanOrEqual(2);
  });
});
