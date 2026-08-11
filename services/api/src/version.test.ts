import { describe, expect, it } from "vitest";
import { getBuildVersionInfo } from "./version";

describe("build version information", () => {
  it("returns stable local defaults", () => {
    const info = getBuildVersionInfo({ APP_ENV: "test" });

    expect(info.appVersion).toBe("0.1.0");
    expect(info.commitSha).toBe("local");
    expect(info.environment).toBe("test");
  });
});
