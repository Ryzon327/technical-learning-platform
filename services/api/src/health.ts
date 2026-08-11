import type { AppHealth } from "@tlp/shared-types";
import { loadRuntimeConfig } from "./config";

export function getApiHealth(): AppHealth {
  const config = loadRuntimeConfig();

  return {
    service: "api",
    state: "healthy",
    checkedAt: new Date().toISOString(),
    version: "0.1.0"
  };
}

export function getApiHealthDetails() {
  const config = loadRuntimeConfig();

  return {
    ...getApiHealth(),
    environment: config.appEnv,
    aiProvider: config.aiDefaultProvider
  };
}
