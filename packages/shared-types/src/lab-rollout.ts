export type LabProviderActivationState =
  | "disabled"
  | "canary_eligible"
  | "enabled"
  | "suspended";

export type LabProviderRolloutMode =
  | "off"
  | "allowlist"
  | "percentage"
  | "all";

export interface LabProviderRolloutPolicy {
  providerId: string;
  activationState: LabProviderActivationState;
  rolloutMode: LabProviderRolloutMode;
  rolloutPercentage: number;
  allowedUserIds: string[];
  updatedAt: string;
}

export interface LabProviderRolloutDecision {
  providerId: string;
  eligible: boolean;
  reason: string;
}

export function deterministicRolloutBucket(
  userId: string,
  providerId: string
): number {
  const input = `${providerId}:${userId}`;

  let hash = 2166136261;

  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0) % 100;
}

export function evaluateLabProviderRollout(
  policy: LabProviderRolloutPolicy,
  userId: string
): LabProviderRolloutDecision {
  if (policy.activationState !== "enabled") {
    return {
      providerId: policy.providerId,
      eligible: false,
      reason: `Provider activation state is ${policy.activationState}.`
    };
  }

  if (policy.rolloutMode === "off") {
    return {
      providerId: policy.providerId,
      eligible: false,
      reason: "Provider rollout mode is off."
    };
  }

  if (policy.rolloutMode === "all") {
    return {
      providerId: policy.providerId,
      eligible: true,
      reason: "Provider is enabled for all eligible users."
    };
  }

  if (policy.rolloutMode === "allowlist") {
    const eligible = policy.allowedUserIds.includes(userId);

    return {
      providerId: policy.providerId,
      eligible,
      reason: eligible
        ? "User is explicitly included in the provider rollout allowlist."
        : "User is not included in the provider rollout allowlist."
    };
  }

  const bucket = deterministicRolloutBucket(
    userId,
    policy.providerId
  );

  const eligible =
    policy.rolloutPercentage > 0 &&
    bucket < policy.rolloutPercentage;

  return {
    providerId: policy.providerId,
    eligible,
    reason: eligible
      ? `User is inside the ${policy.rolloutPercentage}% deterministic rollout.`
      : `User is outside the ${policy.rolloutPercentage}% deterministic rollout.`
  };
}
