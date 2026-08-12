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

interface ContainerRuntimeSession {
  providerSessionId: string;
  state: LabProviderSession["state"];
  endpoint: string;
  createdAt: string;
  validationSignals: Set<string>;
}

export class ContainerLabProvider implements LabProvider {
  readonly providerId = "container";
  private readonly sessions = new Map<string, ContainerRuntimeSession>();
  private readonly maximumSessions = 10;

  async getCapabilities(): Promise<LabProviderCapabilities> {
    return {
      providerId: this.providerId,
      capabilities: [
        "containers",
        "isolated-network",
        "console-access",
        "terminal",
        "deterministic_validation",
        "reset",
        "session_access"
      ],
      accessMethods: ["browser_console", "terminal"]
    };
  }

  async getHealth(providerSessionId?: string): Promise<LabHealth> {
    if (providerSessionId) {
      this.requireSession(providerSessionId);
    }

    return {
      state: "healthy",
      checkedAt: new Date().toISOString(),
      detail: "Container Provider foundation is available."
    };
  }

  async getCapacity(): Promise<LabProviderCapacity> {
    const activeSessions = [...this.sessions.values()].filter(
      (session) => session.state !== "destroyed"
    ).length;

    return {
      providerId: this.providerId,
      available: activeSessions < this.maximumSessions,
      activeSessions,
      maximumSessions: this.maximumSessions
    };
  }

  async provision(request: LabProvisionRequest): Promise<LabProviderSession> {
    const capacity = await this.getCapacity();

    if (!capacity.available) {
      throw new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Container lab capacity is full",
        retryable: true
      });
    }

    const capabilities = await this.getCapabilities();

    const missingCapabilities = request.definition.requiredCapabilities.filter(
      (capability) => !capabilities.capabilities.includes(capability)
    );

    if (missingCapabilities.length > 0) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: `Container Provider missing capabilities: ${missingCapabilities.join(", ")}`,
        retryable: false
      });
    }

    const providerSessionId = `container-${crypto.randomUUID()}`;
    const createdAt = new Date().toISOString();

    const session: ContainerRuntimeSession = {
      providerSessionId,
      state: "ready",
      endpoint: `/container-labs/${encodeURIComponent(providerSessionId)}/console`,
      createdAt,
      validationSignals: new Set<string>()
    };

    this.sessions.set(providerSessionId, session);

    return {
      providerId: this.providerId,
      providerSessionId,
      state: "ready",
      createdAt
    };
  }

  async start(providerSessionId: string): Promise<void> {
    const session = this.requireSession(providerSessionId);
    session.state = "running";
  }

  async stop(providerSessionId: string): Promise<void> {
    const session = this.requireSession(providerSessionId);
    session.state = "stopped";
  }

  async reset(providerSessionId: string): Promise<void> {
    const session = this.requireSession(providerSessionId);
    session.state = "ready";
    session.validationSignals.clear();
  }

  async destroy(providerSessionId: string): Promise<void> {
    const session = this.requireSession(providerSessionId);
    session.state = "destroyed";
  }

  async getConnection(
    providerSessionId: string
  ): Promise<LabConnectionInfo> {
    const session = this.requireSession(providerSessionId);

    return {
      method: "browser_console",
      endpoint: session.endpoint,
      username: "student"
    };
  }

  async runValidationProbe(
    providerSessionId: string,
    probeId: string
  ): Promise<LabValidationProbeResult> {
    const session = this.requireSession(providerSessionId);
    const passed = session.validationSignals.has(probeId);

    return {
      probeId,
      passed,
      detail: passed
        ? "Probe passed."
        : "Probe has not been satisfied."
    };
  }

  async getIsolationStatus(providerSessionId: string): Promise<{
    studentHasProviderAdminAccess: false;
    managementPlaneExposed: false;
    networkIsolationEnforced: true;
    resourceOwnershipScoped: true;
  }> {
    this.requireSession(providerSessionId);

    return {
      studentHasProviderAdminAccess: false,
      managementPlaneExposed: false,
      networkIsolationEnforced: true,
      resourceOwnershipScoped: true
    };
  }

  private requireSession(
    providerSessionId: string
  ): ContainerRuntimeSession {
    const session = this.sessions.get(providerSessionId);

    if (!session || session.state === "destroyed") {
      throw new AppError({
        code: "NOT_FOUND",
        message: "Container provider session not found",
        retryable: false
      });
    }

    return session;
  }
}

export const containerLabProvider = new ContainerLabProvider();
