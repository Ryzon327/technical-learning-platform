import { describe, expect, it } from "vitest";
import {
  DockerCliContainerRuntime,
  loadContainerRuntimeConfig
} from "./container-runtime";

describe("container runtime hardening", () => {
  it("remains disabled by default", () => {
    const config = loadContainerRuntimeConfig({});
    expect(config.enabled).toBe(false);
    expect(config.allowedImages).toEqual([]);
  });

  it("requires the default image to be explicitly allowlisted", () => {
    expect(() =>
      loadContainerRuntimeConfig({
        TLP_CONTAINER_PROVIDER_ENABLED: "true",
        TLP_CONTAINER_DEFAULT_IMAGE: "example/lab:1",
        TLP_CONTAINER_ALLOWED_IMAGES: "example/other:1"
      })
    ).toThrow();
  });

  it("creates containers with hardened runtime flags", async () => {
    const calls: string[][] = [];

    const runtime = new DockerCliContainerRuntime(
      {
        enabled: true,
        binary: "docker",
        defaultImage: "example/lab:1",
        allowedImages: ["example/lab:1"],
        maximumSessions: 10,
        cpuLimit: 1,
        memoryMb: 512,
        pidsLimit: 128,
        tmpfsMb: 64,
        commandTimeoutMs: 10000
      },
      async (_binary, args) => {
        calls.push(args);

        if (
          args[0] === "image" &&
          args[1] === "inspect"
        ) {
          return { stdout: "10001\n", stderr: "" };
        }

        return { stdout: "", stderr: "" };
      }
    );

    await runtime.createSession({
      providerSessionId:
        "tlp-container-00000000-0000-4000-8000-000000000001",
      userId: "user-1",
      definitionStableId: "LABDEF-TEST",
      definitionVersion: 1
    });

    const create = calls.find((args) => args[0] === "create");
    expect(create).toBeDefined();
    expect(create).toContain("--network");
    expect(create).toContain("none");
    expect(create).toContain("--read-only");
    expect(create).toContain("--cap-drop");
    expect(create).toContain("ALL");
    expect(create).toContain("no-new-privileges");
    expect(create).toContain("--pids-limit");
  });
});
