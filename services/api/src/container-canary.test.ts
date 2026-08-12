import { describe, expect, it } from "vitest";
import {
  runContainerProviderCanary
} from "./container-canary";
import type {
  ContainerRuntimeAdapter,
  ContainerRuntimeConfig,
  ContainerRuntimeSecurityState
} from "./container-runtime";

class CanaryRuntime implements ContainerRuntimeAdapter {
  exists = false;
  running = false;
  destroyed = false;

  async health() {
    return { healthy: true, detail: "canary runtime healthy" };
  }

  async countManagedSessions() {
    return this.exists ? 1 : 0;
  }

  async createSession() {
    this.exists = true;
    this.destroyed = false;
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
    this.destroyed = true;
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

const enabledConfig: ContainerRuntimeConfig = {
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

describe("Container Provider canary", () => {
  it("passes only after lifecycle, isolation, validation, reset, and cleanup succeed", async () => {
    const runtime = new CanaryRuntime();

    const result = await runContainerProviderCanary(
      runtime,
      enabledConfig,
      { persist: false }
    );

    expect(result.passed).toBe(true);
    expect(result.stages.map((entry) => entry.stage)).toEqual([
      "configuration",
      "health",
      "capacity",
      "provision",
      "isolation",
      "start",
      "validation",
      "reset",
      "destroy"
    ]);
    expect(runtime.destroyed).toBe(true);
  });

  it("refuses to pass while the Container Provider is disabled", async () => {
    const runtime = new CanaryRuntime();

    const result = await runContainerProviderCanary(
      runtime,
      {
        ...enabledConfig,
        enabled: false
      },
      { persist: false }
    );

    expect(result.passed).toBe(false);
    expect(result.stages[0]).toMatchObject({
      stage: "configuration",
      passed: false
    });
  });
});
