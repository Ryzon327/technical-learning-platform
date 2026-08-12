import { AppError, type LabConnectionInfo, type LabHealth, type LabProvider, type LabProviderCapabilities, type LabProviderCapacity, type LabProviderSession, type LabProvisionRequest, type LabValidationProbeResult } from "@tlp/shared-types";

export type MockLabFailureMode = "none" | "capacity_unavailable" | "provisioning_failure" | "unhealthy_session" | "cleanup_failure" | "validation_unavailable";

export class MockLabProvider implements LabProvider {
  readonly providerId = "mock";
  private readonly sessions = new Map<string, LabProviderSession>();
  private sequence = 0;
  constructor(private failureMode: MockLabFailureMode = "none", private maximumSessions = 25) {}
  setFailureMode(mode: MockLabFailureMode): void { this.failureMode = mode; }
  async getCapabilities(): Promise<LabProviderCapabilities> { return { providerId: this.providerId, capabilities: ["linux", "windows", "containers", "virtual-machines", "isolated-network", "console-access", "ssh", "rdp", "snapshots"], accessMethods: ["ssh", "rdp", "browser_console", "terminal"] }; }
  async getCapacity(): Promise<LabProviderCapacity> { const active = [...this.sessions.values()].filter((s) => s.state !== "destroyed").length; return { providerId: this.providerId, available: this.failureMode !== "capacity_unavailable" && active < this.maximumSessions, activeSessions: active, maximumSessions: this.maximumSessions }; }
  async provision(request: LabProvisionRequest): Promise<LabProviderSession> {
    const capacity = await this.getCapacity();
    if (!capacity.available) throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Mock lab capacity unavailable", retryable: true });
    if (this.failureMode === "provisioning_failure") throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Mock provisioning failure", retryable: true });
    const capabilities = await this.getCapabilities();
    const missing = request.definition.requiredCapabilities.filter((c) => !capabilities.capabilities.includes(c));
    if (missing.length) throw new AppError({ code: "VALIDATION_ERROR", message: `Provider missing capabilities: ${missing.join(", ")}`, retryable: false });
    const session: LabProviderSession = { providerSessionId: `mock-session-${++this.sequence}`, providerId: this.providerId, state: "ready", createdAt: new Date().toISOString() };
    this.sessions.set(session.providerSessionId, session); return session;
  }
  private requireSession(id: string): LabProviderSession { const session = this.sessions.get(id); if (!session || session.state === "destroyed") throw new AppError({ code: "NOT_FOUND", message: "Lab provider session not found", retryable: false }); return session; }
  private setState(id: string, state: LabProviderSession["state"]): void { const current = this.requireSession(id); this.sessions.set(id, { ...current, state }); }
  async start(id: string): Promise<void> { this.setState(id, "running"); }
  async stop(id: string): Promise<void> { this.setState(id, "stopped"); }
  async reset(id: string): Promise<void> { this.requireSession(id); this.setState(id, "ready"); }
  async destroy(id: string): Promise<void> { if (this.failureMode === "cleanup_failure") throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Mock cleanup failure", retryable: true }); this.setState(id, "destroyed"); }
  async getConnection(id: string): Promise<LabConnectionInfo> { this.requireSession(id); return { method: "browser_console", endpoint: `/mock-labs/${encodeURIComponent(id)}/console` }; }
  async getHealth(id?: string): Promise<LabHealth> { if (id) this.requireSession(id); return { state: this.failureMode === "unhealthy_session" ? "degraded" : "healthy", checkedAt: new Date().toISOString(), detail: "deterministic mock provider" }; }
  async runValidationProbe(id: string, probeId: string): Promise<LabValidationProbeResult> { this.requireSession(id); if (this.failureMode === "validation_unavailable") throw new AppError({ code: "DEPENDENCY_UNAVAILABLE", message: "Mock validation unavailable", retryable: true }); return { probeId, passed: !probeId.startsWith("fail:"), detail: "deterministic mock fixture" }; }
}

export const mockLabProvider = new MockLabProvider();
