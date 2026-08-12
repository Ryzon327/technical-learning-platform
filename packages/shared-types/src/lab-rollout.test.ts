import { describe, expect, it } from "vitest";
import {
  deterministicRolloutBucket,
  evaluateLabProviderRollout,
  type LabProviderRolloutPolicy
} from "./lab-rollout";

const basePolicy: LabProviderRolloutPolicy = {
  providerId: "container",
  activationState: "enabled",
  rolloutMode: "allowlist",
  rolloutPercentage: 0,
  allowedUserIds: ["user-allowed"],
  updatedAt: "2026-08-12T00:00:00.000Z"
};

describe("lab provider rollout policy", () => {
  it("never rolls out a provider that is not explicitly enabled", () => {
    expect(
      evaluateLabProviderRollout(
        {
          ...basePolicy,
          activationState: "canary_eligible"
        },
        "user-allowed"
      ).eligible
    ).toBe(false);
  });

  it("supports explicit allowlist rollout", () => {
    expect(
      evaluateLabProviderRollout(
        basePolicy,
        "user-allowed"
      ).eligible
    ).toBe(true);

    expect(
      evaluateLabProviderRollout(
        basePolicy,
        "user-other"
      ).eligible
    ).toBe(false);
  });

  it("uses a stable rollout bucket", () => {
    expect(
      deterministicRolloutBucket("user-1", "container")
    ).toBe(
      deterministicRolloutBucket("user-1", "container")
    );
  });
});
