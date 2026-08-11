import type { BuildVersionInfo } from "@tlp/shared-types";
import { loadRuntimeConfig } from "./config";

export function getBuildVersionInfo(
  env: NodeJS.ProcessEnv = process.env
): BuildVersionInfo {
  const config = loadRuntimeConfig(env);

  return {
    appVersion: env.APP_VERSION?.trim() || "0.1.0",
    commitSha: env.GIT_COMMIT_SHA?.trim() || "local",
    buildTime: env.BUILD_TIME?.trim() || "local",
    environment: config.appEnv
  };
}
