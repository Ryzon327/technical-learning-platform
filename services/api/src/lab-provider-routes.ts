import type { ServerResponse } from "node:http";

import { sendJson } from "./http-utils";
import { listRegisteredLabProviders } from "./lab-provider-registry";

export async function sendLabProviderCatalog(
  response: ServerResponse
): Promise<void> {
  const providers = await Promise.all(
    listRegisteredLabProviders().map(
      async (registration) => {
        const provider = registration.provider;

        const [capabilities, health, capacity] =
          await Promise.all([
            provider.getCapabilities(),
            provider.getHealth(),
            provider.getCapacity()
          ]);

        return {
          providerId: registration.providerId,
          enabled: registration.enabled,
          capabilities,
          health,
          capacity
        };
      }
    )
  );

  sendJson(response, 200, { providers });
}
