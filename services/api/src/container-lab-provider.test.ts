import { describe, expect, it } from "vitest";
import {
  ContainerLabProvider
} from "./container-lab-provider";
import type {
  ContainerRuntimeAdapter,
  ContainerRuntimeConfig,
  ContainerRuntimeSecurityState
} from "./container-runtime";

class FakeContainerRuntime
  implements ContainerRuntimeAdapter
{
  exists = false;
  running = false;

  async health() {
    return { healthy: true, detail: "fake healthy runtime" };
  }

  async countManagedSessions() {
    return this.exists ? 1 : 0;
  }

  async createSession() {
    this.exists = true;
  }

  async startSession() {
    this.running = true;
  }

  async stopSession() {
    this.running = false;
  }

  async resetSession() {
    this.running = false;
  }

  async destroySession() {
    this.exists = false;
    this.running = false;
  }

  async sessionExists() {
    return this.exists;
  }

  async sessionRunning() {
    return this.running;
  }

  async inspectSecurity(): Promise<ContainerRuntimeSecurityState> {
    return {
      nonRootImageUser: true,
      privileged: false,
      networkMode: "none",
      readonlyRootfs: true,
      capDropAll: true,
      noNewPrivileges: true,
      dockerSocketMounted: false
    };
  }
}

const config: ContainerRuntimeConfig = {
  enabled: true,
  binary: "docker",
  defaultImage: "example/lab:1",
  allowedImages: ["example/lab:1"],
  maximumSessions: 10,
  cpuLimit: 1,
  memoryMb: 512,
  pidsLimit: 128,
  tmpfsMb: 64,
  commandTimeoutMs: 10000
};

describe("container lab provider runtime adapter", () => {
  it("implements lifecycle and isolation without exposing runtime admin access", async () => {
    const runtime = new FakeContainerRuntime();
    const provider = new ContainerLabProvider(runtime, config);

    const session = await provider.provision({
      userId: "user-1",
      definition: {
        stableId: "LABDEF-TEST",
        version: 1,
        name: "Test Lab",
        description: "Runtime adapter test",
        missionStableId: "MISSION-TEST",
        competencyStableIds: ["COMP-TEST"],
        requiredCapabilities: ["containers"],
        resources: [
          {
            role: "student-node",
            kind: "container",
            count: 1,
            minimumCpuCores: 1,
            minimumMemoryMb: 256,
            imageReference: "example/lab:1"
          }
        ],
        accessMethods: ["terminal"],
        estimatedDurationMinutes: 10,
        sessionLimitMinutes: 30,
        validationProfileStableId: "VAL-TEST",
        resetStrategy: "recreate",
        safety: {
          classification: "standard",
          internetAccessAllowed: false,
          outboundTrafficRestricted: true,
          privilegedAccessRequired: false,
          allowedNetworkScopes: ["session-only"],
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
        publicationState: "published"
      }
    });

    expect(session.state).toBe("ready");

    await provider.start(session.providerSessionId);
    expect(
      await provider.runValidationProbe(
        session.providerSessionId,
        "container.running"
      )
    ).toMatchObject({
      probeId: "container.running",
      passed: true
    });

    const isolation = await provider.getIsolationStatus(
      session.providerSessionId
    );

    expect(isolation.studentHasProviderAdminAccess).toBe(false);
    expect(isolation.managementPlaneExposed).toBe(false);
    expect(isolation.networkIsolationEnforced).toBe(true);
    expect(isolation.resourceOwnershipScoped).toBe(true);

    await provider.destroy(session.providerSessionId);
    expect(runtime.exists).toBe(false);
  });
});
