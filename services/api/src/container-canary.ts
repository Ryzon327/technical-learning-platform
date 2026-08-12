import {
  AppError,
  type LabDefinition
} from "@tlp/shared-types";
import {
  ContainerLabProvider
} from "./container-lab-provider";
import {
  DockerCliContainerRuntime,
  loadContainerRuntimeConfig,
  type ContainerRuntimeAdapter,
  type ContainerRuntimeConfig
} from "./container-runtime";
import { createServerSupabaseClient } from "./supabase";

export type ContainerCanaryStage =
  | "configuration"
  | "health"
  | "capacity"
  | "provision"
  | "isolation"
  | "start"
  | "validation"
  | "reset"
  | "destroy";

export interface ContainerCanaryStageResult {
  stage: ContainerCanaryStage;
  passed: boolean;
  detail: string;
}

export interface ContainerCanaryResult {
  passed: boolean;
  startedAt: string;
  completedAt: string;
  providerId: "container";
  imageReference: string;
  stages: ContainerCanaryStageResult[];
}

export interface ContainerProviderActivationDecision {
  eligible: boolean;
  reason: string;
  latestCanaryCompletedAt?: string;
}

const CANARY_DEFINITION: LabDefinition = {
  stableId: "LABDEF-CONTAINER-CANARY",
  version: 1,
  name: "Container Provider Canary",
  description:
    "Internal deterministic lifecycle verification for the Container Provider.",
  missionStableId: "MISSION-CONTAINER-CANARY",
  competencyStableIds: ["COMP-CONTAINER-CANARY"],
  requiredCapabilities: ["containers"],
  resources: [
    {
      role: "canary-node",
      kind: "container",
      count: 1,
      minimumCpuCores: 1,
      minimumMemoryMb: 128
    }
  ],
  accessMethods: ["terminal"],
  estimatedDurationMinutes: 1,
  sessionLimitMinutes: 5,
  validationProfileStableId: "VAL-CONTAINER-CANARY",
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
};

function stage(
  stageName: ContainerCanaryStage,
  passed: boolean,
  detail: string
): ContainerCanaryStageResult {
  return {
    stage: stageName,
    passed,
    detail
  };
}

async function persistCanaryResult(
  result: ContainerCanaryResult
): Promise<void> {
  const server = createServerSupabaseClient();

  const { error } = await server
    .from("lab_provider_canary_runs")
    .insert({
      provider_id: result.providerId,
      image_reference: result.imageReference,
      passed: result.passed,
      started_at: result.startedAt,
      completed_at: result.completedAt,
      stages: result.stages
    });

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to persist Container Provider canary result",
      retryable: true
    });
  }
}

export async function runContainerProviderCanary(
  runtime: ContainerRuntimeAdapter,
  config: ContainerRuntimeConfig,
  options: { persist?: boolean } = {}
): Promise<ContainerCanaryResult> {
  const startedAt = new Date().toISOString();
  const stages: ContainerCanaryStageResult[] = [];
  const provider = new ContainerLabProvider(runtime, config);

  let providerSessionId: string | undefined;

  const fail = async (
    stageName: ContainerCanaryStage,
    detail: string
  ): Promise<ContainerCanaryResult> => {
    stages.push(stage(stageName, false, detail));

    if (providerSessionId) {
      try {
        await provider.destroy(providerSessionId);
      } catch {
        // Best-effort cleanup; failed cleanup is surfaced by the destroy stage below
        // only when destroy is the active stage.
      }
    }

    const result: ContainerCanaryResult = {
      passed: false,
      startedAt,
      completedAt: new Date().toISOString(),
      providerId: "container",
      imageReference: config.defaultImage,
      stages
    };

    if (options.persist !== false) {
      await persistCanaryResult(result);
    }

    return result;
  };

  if (!config.enabled) {
    return fail(
      "configuration",
      "Container Provider is disabled. Canary requires explicit temporary enablement."
    );
  }

  if (
    !config.defaultImage ||
    !config.allowedImages.includes(config.defaultImage)
  ) {
    return fail(
      "configuration",
      "Container Provider default image is not explicitly allowlisted."
    );
  }

  stages.push(
    stage(
      "configuration",
      true,
      "Container Provider is enabled for canary and the image is explicitly allowlisted."
    )
  );

  const health = await provider.getHealth();
  if (health.state !== "healthy") {
    return fail(
      "health",
      health.detail ?? "Container runtime is not healthy."
    );
  }

  stages.push(
    stage("health", true, health.detail ?? "Container runtime is healthy.")
  );

  const capacity = await provider.getCapacity();
  if (!capacity.available) {
    return fail(
      "capacity",
      "Container runtime has no available canary capacity."
    );
  }

  stages.push(
    stage(
      "capacity",
      true,
      `Container runtime has capacity (${capacity.activeSessions}/${capacity.maximumSessions}).`
    )
  );

  try {
    const session = await provider.provision({
      definition: CANARY_DEFINITION,
      userId: "container-provider-canary"
    });

    providerSessionId = session.providerSessionId;

    stages.push(
      stage(
        "provision",
        session.state === "ready",
        `Canary session provisioned as ${session.providerSessionId}.`
      )
    );
  } catch (error) {
    return fail(
      "provision",
      error instanceof Error ? error.message : "Canary provisioning failed."
    );
  }

  const isolation = await provider.getIsolationStatus(providerSessionId);

  const isolationPassed =
    isolation.studentHasProviderAdminAccess === false &&
    isolation.managementPlaneExposed === false &&
    isolation.networkIsolationEnforced === true &&
    isolation.resourceOwnershipScoped === true;

  if (!isolationPassed) {
    return fail(
      "isolation",
      "Container runtime failed one or more required isolation assertions."
    );
  }

  stages.push(
    stage(
      "isolation",
      true,
      "No provider-admin access, no management-plane exposure, network isolation enforced, and resource ownership scoped."
    )
  );

  try {
    await provider.start(providerSessionId);
    stages.push(
      stage("start", true, "Canary container started successfully.")
    );
  } catch (error) {
    return fail(
      "start",
      error instanceof Error ? error.message : "Canary start failed."
    );
  }

  const validation = await provider.runValidationProbe(
    providerSessionId,
    "container.running"
  );

  if (!validation.passed) {
    return fail("validation", validation.detail);
  }

  stages.push(
    stage("validation", true, validation.detail)
  );

  try {
    await provider.reset(providerSessionId);
    stages.push(
      stage("reset", true, "Canary container reset successfully.")
    );
  } catch (error) {
    return fail(
      "reset",
      error instanceof Error ? error.message : "Canary reset failed."
    );
  }

  try {
    await provider.destroy(providerSessionId);
    providerSessionId = undefined;
    stages.push(
      stage("destroy", true, "Canary container cleanup completed.")
    );
  } catch (error) {
    return fail(
      "destroy",
      error instanceof Error ? error.message : "Canary cleanup failed."
    );
  }

  const result: ContainerCanaryResult = {
    passed: true,
    startedAt,
    completedAt: new Date().toISOString(),
    providerId: "container",
    imageReference: config.defaultImage,
    stages
  };

  if (options.persist !== false) {
    await persistCanaryResult(result);
  }

  return result;
}

export async function evaluateContainerProviderActivation(): Promise<ContainerProviderActivationDecision> {
  const server = createServerSupabaseClient();

  const { data, error } = await server
    .from("lab_provider_canary_runs")
    .select("passed,completed_at")
    .eq("provider_id", "container")
    .order("completed_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new AppError({
      code: "DEPENDENCY_UNAVAILABLE",
      message: "Unable to evaluate Container Provider activation readiness",
      retryable: true
    });
  }

  if (!data) {
    return {
      eligible: false,
      reason: "No Container Provider canary run exists."
    };
  }

  if (!data.passed) {
    return {
      eligible: false,
      reason: "The latest Container Provider canary failed.",
      latestCanaryCompletedAt: String(data.completed_at)
    };
  }

  return {
    eligible: true,
    reason:
      "The latest Container Provider canary passed. Explicit Founder activation is still required.",
    latestCanaryCompletedAt: String(data.completed_at)
  };
}

export function createConfiguredContainerCanaryRuntime() {
  const config = loadContainerRuntimeConfig();
  const runtime = new DockerCliContainerRuntime(config);
  return { config, runtime };
}
