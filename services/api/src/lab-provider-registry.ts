import {
  AppError,
  type LabProvider
} from "@tlp/shared-types";

import { containerLabProvider } from "./container-lab-provider";
import { mockLabProvider } from "./mock-lab-provider";

export type RegisteredLabProviderId = "mock" | "container";

interface RegisteredProvider {
  providerId: RegisteredLabProviderId;
  provider: LabProvider;
  enabled: boolean;
}

const providers = new Map<RegisteredLabProviderId, RegisteredProvider>([
  [
    "mock",
    {
      providerId: "mock",
      provider: mockLabProvider,
      enabled: true
    }
  ],
  [
    "container",
    {
      providerId: "container",
      provider: containerLabProvider,
      enabled: false
    }
  ]
]);

export function getLabProvider(
  providerId: RegisteredLabProviderId
): LabProvider {
  const registration = providers.get(providerId);

  if (!registration) {
    throw new AppError({
      code: "NOT_FOUND",
      message: `Lab provider ${providerId} is not registered`,
      retryable: false
    });
  }

  return registration.provider;
}

export function listRegisteredLabProviders(): Array<{
  providerId: RegisteredLabProviderId;
  provider: LabProvider;
  enabled: boolean;
}> {
  return [...providers.values()];
}

export async function chooseLabProvider(
  requiredCapabilities: string[]
): Promise<LabProvider> {
  for (const registration of listRegisteredLabProviders()) {
    if (!registration.enabled) {
      continue;
    }

    const provider = registration.provider;

    const [health, capacity, capabilities] = await Promise.all([
      provider.getHealth(),
      provider.getCapacity(),
      provider.getCapabilities()
    ]);

    if (health.state !== "healthy") {
      continue;
    }

    if (!capacity.available) {
      continue;
    }

    const supportsAllCapabilities = requiredCapabilities.every(
      (capability) => capabilities.capabilities.includes(capability)
    );

    if (!supportsAllCapabilities) {
      continue;
    }

    return provider;
  }

  throw new AppError({
    code: "DEPENDENCY_UNAVAILABLE",
    message:
      "No enabled healthy Lab Provider currently satisfies this Lab Definition",
    retryable: true
  });
}
