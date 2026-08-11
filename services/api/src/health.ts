import type { AppHealth } from "@tlp/shared-types";

export function getApiHealth(): AppHealth {
  return {
    service: "api",
    state: "healthy",
    checkedAt: new Date().toISOString(),
    version: "0.1.0"
  };
}
