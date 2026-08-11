import type { AppHealth } from "@tlp/shared-types";
import { loadRuntimeConfig } from "./config";
import { getBuildVersionInfo } from "./version";

export function getApiHealth(): AppHealth {
  const version = getBuildVersionInfo();

  return {
    service: "api",
    state: "healthy",
    checkedAt: new Date().toISOString(),
    version: version.appVersion
  };
}

export function getApiHealthDetails() {
  const config = loadRuntimeConfig();
  const version = getBuildVersionInfo();

  return {
    ...getApiHealth(),
    environment: config.appEnv,
    aiProvider: config.aiDefaultProvider,
    build: {
      commitSha: version.commitSha,
      buildTime: version.buildTime
    }
  };
}
