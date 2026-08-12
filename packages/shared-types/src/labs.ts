export type LabPublicationState = "draft" | "review" | "published" | "retired";
export type LabSafetyClassification = "standard" | "elevated" | "offensive_security_restricted";
export type LabAccessMethod = "ssh" | "rdp" | "browser_console" | "terminal";
export type LabResetStrategy = "recreate" | "snapshot" | "provider_reset";
export type LabDataPersistencePolicy = "ephemeral" | "session";

export interface LabResourceRequirement {
  role: string;
  kind: "linux_node" | "windows_node" | "network_device" | "container" | "virtual_machine";
  count: number;
  minimumMemoryMb?: number;
  minimumCpuCores?: number;
  imageReference?: string;
}

export interface LabSafetyMetadata {
  classification: LabSafetyClassification;
  internetAccessAllowed: boolean;
  outboundTrafficRestricted: boolean;
  privilegedAccessRequired: boolean;
  allowedNetworkScopes: string[];
  prohibitedContent: string[];
}

export interface LabAccessibilityMetadata {
  connectionMethods: LabAccessMethod[];
  keyboardRequired: boolean;
  screenReaderLimitations: string[];
  commandLineAlternativeAvailable: boolean;
  visualOnlyActivities: string[];
  accommodations: string[];
  timingIsEssentialCompetency: boolean;
}

export interface LabDefinition {
  stableId: string;
  version: number;
  name: string;
  description: string;
  missionStableId: string;
  competencyStableIds: string[];
  requiredCapabilities: string[];
  resources: LabResourceRequirement[];
  accessMethods: LabAccessMethod[];
  estimatedDurationMinutes: number;
  sessionLimitMinutes: number;
  validationProfileStableId: string;
  resetStrategy: LabResetStrategy;
  safety: LabSafetyMetadata;
  accessibility: LabAccessibilityMetadata;
  dataPersistencePolicy: LabDataPersistencePolicy;
  publicationState: LabPublicationState;
}

export interface LabDefinitionValidationResult { valid: boolean; errors: string[]; }

export function validateLabDefinition(definition: LabDefinition): LabDefinitionValidationResult {
  const errors: string[] = [];
  if (!/^LABDEF-[A-Z0-9][A-Z0-9-]*$/.test(definition.stableId)) errors.push("stableId must be a stable LABDEF-* identifier");
  if (!Number.isInteger(definition.version) || definition.version < 1) errors.push("version must be a positive integer");
  if (!definition.name.trim()) errors.push("name is required");
  if (!definition.missionStableId.trim()) errors.push("missionStableId is required");
  if (definition.competencyStableIds.length === 0) errors.push("at least one competency is required");
  if (definition.requiredCapabilities.length === 0) errors.push("at least one provider capability is required");
  if (definition.resources.length === 0 || definition.resources.some((r) => !r.role.trim() || r.count < 1)) errors.push("valid resource requirements are required");
  if (definition.accessMethods.length === 0) errors.push("at least one access method is required");
  if (!definition.validationProfileStableId.trim()) errors.push("validation profile reference is required");
  if (definition.estimatedDurationMinutes < 1 || definition.sessionLimitMinutes < definition.estimatedDurationMinutes) errors.push("session timing is invalid");
  if (definition.safety.allowedNetworkScopes.length === 0) errors.push("safety.allowedNetworkScopes must be explicit");
  if (definition.accessibility.connectionMethods.length === 0) errors.push("accessibility connection methods are required");
  return { valid: errors.length === 0, errors };
}

export type LabProviderHealthState = "healthy" | "degraded" | "unavailable";
export interface LabProviderCapabilities { providerId: string; capabilities: string[]; accessMethods: LabAccessMethod[]; }
export interface LabProviderCapacity { providerId: string; available: boolean; activeSessions: number; maximumSessions: number; }
export interface LabProvisionRequest { definition: LabDefinition; userId: string; }
export interface LabProviderSession { providerSessionId: string; providerId: string; state: "provisioning" | "ready" | "running" | "stopped" | "destroyed" | "failed"; createdAt: string; }
export interface LabConnectionInfo { method: LabAccessMethod; endpoint: string; username?: string; expiresAt?: string; }
export interface LabHealth { state: LabProviderHealthState; checkedAt: string; detail?: string; }
export interface LabValidationProbeResult { probeId: string; passed: boolean; detail: string; }

export interface LabProvider {
  getCapabilities(): Promise<LabProviderCapabilities>;
  getCapacity(): Promise<LabProviderCapacity>;
  provision(request: LabProvisionRequest): Promise<LabProviderSession>;
  start(sessionId: string): Promise<void>;
  stop(sessionId: string): Promise<void>;
  reset(sessionId: string): Promise<void>;
  destroy(sessionId: string): Promise<void>;
  getConnection(sessionId: string): Promise<LabConnectionInfo>;
  getHealth(sessionId?: string): Promise<LabHealth>;
  runValidationProbe(sessionId: string, probeId: string): Promise<LabValidationProbeResult>;
}
