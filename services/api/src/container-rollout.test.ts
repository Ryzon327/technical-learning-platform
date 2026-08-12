import { describe, expect, it } from "vitest";
import {
  evaluateLabProviderRollout,
  type LabProviderRolloutPolicy
} from "@tlp/shared-types";

describe("Container Provider controlled rollout boundary", () => {
  it("does not treat canary eligibility as production enablement", () => {
    const policy: LabProviderRolloutPolicy = {
      providerId: "container",
      activationState: "canary_eligible",
      rolloutMode: "allowlist",
      rolloutPercentage: 0,
      allowedUserIds: ["user-1"],
      updatedAt: "2026-08-12T00:00:00.000Z"
    };

    expect(
      evaluateLabProviderRollout(policy, "user-1").eligible
    ).toBe(false);
  });

  it("supports an explicit single-user canary rollout", () => {
    const policy: LabProviderRolloutPolicy = {
      providerId: "container",
      activationState: "enabled",
      rolloutMode: "allowlist",
      rolloutPercentage: 0,
      allowedUserIds: ["user-1"],
      updatedAt: "2026-08-12T00:00:00.000Z"
    };

    expect(
      evaluateLabProviderRollout(policy, "user-1").eligible
    ).toBe(true);

    expect(
      evaluateLabProviderRollout(policy, "user-2").eligible
    ).toBe(false);
  });
});
