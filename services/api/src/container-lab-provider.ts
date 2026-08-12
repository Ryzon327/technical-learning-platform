import {
  AppError,
  type LabConnectionInfo,
  type LabHealth,
  type LabProvider,
  type LabProviderCapabilities,
  type LabProviderCapacity,
  type LabProviderSession,
  type LabProvisionRequest,
  type LabValidationProbeResult
} from "@tlp/shared-types";
import {
  DockerCliContainerRuntime,
  loadContainerRuntimeConfig,
  type ContainerRuntimeAdapter,
  type ContainerRuntimeConfig
} from "./container-runtime";

export class ContainerLabProvider implements LabProvider {
  readonly providerId = "container";

  constructor(
    private readonly runtime: ContainerRuntimeAdapter,
    private readonly config: ContainerRuntimeConfig
  ) {}

  async getCapabilities(): Promise<LabProviderCapabilities> {
    return {
      providerId: this.providerId,
      capabilities: [
        "containers",
        "isolated-network",
        "console-access"
      ],
      accessMethods: ["terminal"]
    };
  }

  async getHealth(
    providerSessionId?: string
  ): Promise<LabHealth> {
    const checkedAt = new Date().toISOString();

    if (!this.config.enabled) {
      return {
        state: "unavailable",
        checkedAt,
        detail: "Container Provider is disabled."
      };
    }

    if (providerSessionId) {
      if (!(await this.runtime.sessionExists(providerSessionId))) {
        return {
          state: "unavailable",
          checkedAt,
          detail: "Container Provider session does not exist."
        };
      }
    }

    const health = await this.runtime.health();

    return {
      state: health.healthy ? "healthy" : "unavailable",
      checkedAt,
      detail: health.detail
    };
  }

  async getCapacity(): Promise<LabProviderCapacity> {
    if (!this.config.enabled) {
      return {
        providerId: this.providerId,
        available: false,
        activeSessions: 0,
        maximumSessions: this.config.maximumSessions
      };
    }

    const activeSessions =
      await this.runtime.countManagedSessions();

    return {
      providerId: this.providerId,
      available:
        activeSessions < this.config.maximumSessions,
      activeSessions,
      maximumSessions: this.config.maximumSessions
    };
  }

  async provision(
    request: LabProvisionRequest
  ): Promise<LabProviderSession> {
    if (!this.config.enabled) {
      throw new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Container Provider is disabled",
        retryable: false
      });
    }

    const capacity = await this.getCapacity();

    if (!capacity.available) {
      throw new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Container lab capacity is full",
        retryable: true
      });
    }

    const capabilities = await this.getCapabilities();
    const missing =
      request.definition.requiredCapabilities.filter(
        (capability) =>
          !capabilities.capabilities.includes(capability)
      );

    if (missing.length > 0) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message:
          `Container Provider missing capabilities: ${missing.join(", ")}`,
        retryable: false
      });
    }

    const providerSessionId =
      `tlp-container-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();

    await this.runtime.createSession({
      providerSessionId,
      userId: request.userId,
      definitionStableId: request.definition.stableId,
      definitionVersion: request.definition.version
    });

    return {
      providerId: this.providerId,
      providerSessionId,
      state: "ready",
      createdAt
    };
  }

  async start(providerSessionId: string): Promise<void> {
    await this.runtime.startSession(providerSessionId);
  }

  async stop(providerSessionId: string): Promise<void> {
    await this.runtime.stopSession(providerSessionId);
  }

  async reset(providerSessionId: string): Promise<void> {
    await this.runtime.resetSession(providerSessionId);
  }

  async destroy(providerSessionId: string): Promise<void> {
    await this.runtime.destroySession(providerSessionId);
  }

  async getConnection(
    providerSessionId: string
  ): Promise<LabConnectionInfo> {
    if (!(await this.runtime.sessionExists(providerSessionId))) {
      throw new AppError({
        code: "NOT_FOUND",
        message: "Container Provider session not found",
        retryable: false
      });
    }

    return {
      method: "terminal",
      endpoint:
        `/container-labs/${encodeURIComponent(providerSessionId)}/terminal`,
      username: "student"
    };
  }

  async runValidationProbe(
    providerSessionId: string,
    probeId: string
  ): Promise<LabValidationProbeResult> {
    if (!(await this.runtime.sessionExists(providerSessionId))) {
      throw new AppError({
        code: "NOT_FOUND",
        message: "Container Provider session not found",
        retryable: false
      });
    }

    if (probeId === "container.running") {
      const running =
        await this.runtime.sessionRunning(providerSessionId);

      return {
        probeId,
        passed: running,
        detail: running
          ? "Container session is running."
          : "Container session is not running."
      };
    }

    const security =
      await this.runtime.inspectSecurity(providerSessionId);

    if (probeId === "security.nonroot") {
      return {
        probeId,
        passed: security.nonRootImageUser,
        detail: security.nonRootImageUser
          ? "Container image declares a non-root user."
          : "Container image does not declare a non-root user."
      };
    }

    if (probeId === "security.readonly-rootfs") {
      return {
        probeId,
        passed: security.readonlyRootfs,
        detail: security.readonlyRootfs
          ? "Root filesystem is read-only."
          : "Root filesystem is writable."
      };
    }

    if (probeId === "security.no-network") {
      const passed = security.networkMode === "none";
      return {
        probeId,
        passed,
        detail: passed
          ? "Container network is isolated."
          : "Container network is not isolated."
      };
    }

    throw new AppError({
      code: "VALIDATION_ERROR",
      message:
        `Container Provider validation probe is not registered: ${probeId}`,
      retryable: false
    });
  }

  async getIsolationStatus(providerSessionId: string): Promise<{
    studentHasProviderAdminAccess: false;
    managementPlaneExposed: false;
    networkIsolationEnforced: boolean;
    resourceOwnershipScoped: boolean;
  }> {
    const security =
      await this.runtime.inspectSecurity(providerSessionId);

    const safe =
      !security.privileged &&
      security.networkMode === "none" &&
      security.readonlyRootfs &&
      security.capDropAll &&
      security.noNewPrivileges &&
      !security.dockerSocketMounted;

    return {
      studentHasProviderAdminAccess: false,
      managementPlaneExposed: false,
      networkIsolationEnforced:
        security.networkMode === "none",
      resourceOwnershipScoped: safe
    };
  }
}

const containerRuntimeConfig =
  loadContainerRuntimeConfig();

export const containerLabProvider =
  new ContainerLabProvider(
    new DockerCliContainerRuntime(containerRuntimeConfig),
    containerRuntimeConfig
  );
