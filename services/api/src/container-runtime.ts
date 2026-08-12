import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { AppError } from "@tlp/shared-types";

const execFileAsync = promisify(execFile);

export interface ContainerRuntimeConfig {
  enabled: boolean;
  binary: string;
  defaultImage: string;
  allowedImages: string[];
  maximumSessions: number;
  cpuLimit: number;
  memoryMb: number;
  pidsLimit: number;
  tmpfsMb: number;
  commandTimeoutMs: number;
}

export interface ContainerRuntimeSecurityState {
  nonRootImageUser: boolean;
  privileged: boolean;
  networkMode: string;
  readonlyRootfs: boolean;
  capDropAll: boolean;
  noNewPrivileges: boolean;
  dockerSocketMounted: boolean;
}

export interface ContainerRuntimeAdapter {
  health(): Promise<{ healthy: boolean; detail: string }>;
  countManagedSessions(): Promise<number>;
  createSession(input: {
    providerSessionId: string;
    userId: string;
    definitionStableId: string;
    definitionVersion: number;
  }): Promise<void>;
  startSession(providerSessionId: string): Promise<void>;
  stopSession(providerSessionId: string): Promise<void>;
  resetSession(providerSessionId: string): Promise<void>;
  destroySession(providerSessionId: string): Promise<void>;
  sessionExists(providerSessionId: string): Promise<boolean>;
  sessionRunning(providerSessionId: string): Promise<boolean>;
  inspectSecurity(
    providerSessionId: string
  ): Promise<ContainerRuntimeSecurityState>;
}

function integerFromEnv(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new AppError({
      code: "CONFIGURATION_ERROR",
      message: `Container runtime integer setting must be between ${minimum} and ${maximum}`,
      retryable: false
    });
  }
  return parsed;
}

function numberFromEnv(
  raw: string | undefined,
  fallback: number,
  minimum: number,
  maximum: number
): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < minimum || parsed > maximum) {
    throw new AppError({
      code: "CONFIGURATION_ERROR",
      message: `Container runtime numeric setting must be between ${minimum} and ${maximum}`,
      retryable: false
    });
  }
  return parsed;
}

export function loadContainerRuntimeConfig(
  env: NodeJS.ProcessEnv = process.env
): ContainerRuntimeConfig {
  const enabled = env.TLP_CONTAINER_PROVIDER_ENABLED === "true";
  const defaultImage = (env.TLP_CONTAINER_DEFAULT_IMAGE ?? "").trim();
  const allowedImages = (env.TLP_CONTAINER_ALLOWED_IMAGES ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (enabled) {
    if (!defaultImage) {
      throw new AppError({
        code: "CONFIGURATION_ERROR",
        message:
          "TLP_CONTAINER_DEFAULT_IMAGE is required when the Container Provider is enabled",
        retryable: false
      });
    }

    if (!allowedImages.includes(defaultImage)) {
      throw new AppError({
        code: "CONFIGURATION_ERROR",
        message:
          "TLP_CONTAINER_DEFAULT_IMAGE must also appear in TLP_CONTAINER_ALLOWED_IMAGES",
        retryable: false
      });
    }
  }

  return {
    enabled,
    binary: (env.TLP_CONTAINER_RUNTIME_BINARY ?? "docker").trim() || "docker",
    defaultImage,
    allowedImages,
    maximumSessions: integerFromEnv(
      env.TLP_CONTAINER_MAX_SESSIONS,
      10,
      1,
      100
    ),
    cpuLimit: numberFromEnv(
      env.TLP_CONTAINER_CPU_LIMIT,
      1,
      0.25,
      8
    ),
    memoryMb: integerFromEnv(
      env.TLP_CONTAINER_MEMORY_MB,
      512,
      128,
      8192
    ),
    pidsLimit: integerFromEnv(
      env.TLP_CONTAINER_PIDS_LIMIT,
      128,
      32,
      1024
    ),
    tmpfsMb: integerFromEnv(
      env.TLP_CONTAINER_TMPFS_MB,
      64,
      16,
      1024
    ),
    commandTimeoutMs: integerFromEnv(
      env.TLP_CONTAINER_COMMAND_TIMEOUT_MS,
      10000,
      1000,
      60000
    )
  };
}

interface ExecResult {
  stdout: string;
  stderr: string;
}

export class DockerCliContainerRuntime
  implements ContainerRuntimeAdapter
{
  constructor(
    private readonly config: ContainerRuntimeConfig,
    private readonly execute: (
      binary: string,
      args: string[],
      timeoutMs: number
    ) => Promise<ExecResult> = async (binary, args, timeoutMs) => {
      const result = await execFileAsync(binary, args, {
        timeout: timeoutMs,
        maxBuffer: 1024 * 1024
      });
      return {
        stdout: String(result.stdout ?? ""),
        stderr: String(result.stderr ?? "")
      };
    }
  ) {}

  async health(): Promise<{ healthy: boolean; detail: string }> {
    if (!this.config.enabled) {
      return {
        healthy: false,
        detail: "Container Provider is disabled."
      };
    }

    try {
      const result = await this.run([
        "version",
        "--format",
        "{{.Server.Version}}"
      ]);

      const version = result.stdout.trim();
      return {
        healthy: Boolean(version),
        detail: version
          ? `Container runtime server ${version} is reachable.`
          : "Container runtime returned no server version."
      };
    } catch {
      return {
        healthy: false,
        detail: "Container runtime is unavailable."
      };
    }
  }

  async countManagedSessions(): Promise<number> {
    if (!this.config.enabled) return 0;

    const result = await this.run([
      "ps",
      "-a",
      "--filter",
      "label=tlp.managed=true",
      "--format",
      "{{.Names}}"
    ]);

    return result.stdout
      .split("\n")
      .map((line) => line.trim())
      .filter(Boolean).length;
  }

  async createSession(input: {
    providerSessionId: string;
    userId: string;
    definitionStableId: string;
    definitionVersion: number;
  }): Promise<void> {
    this.requireEnabled();
    this.requireAllowedImage(this.config.defaultImage);
    await this.requireNonRootImage(this.config.defaultImage);

    await this.run([
      "create",
      "--name",
      input.providerSessionId,
      "--label",
      "tlp.managed=true",
      "--label",
      `tlp.user_id=${input.userId}`,
      "--label",
      `tlp.definition_stable_id=${input.definitionStableId}`,
      "--label",
      `tlp.definition_version=${input.definitionVersion}`,
      "--network",
      "none",
      "--memory",
      `${this.config.memoryMb}m`,
      "--cpus",
      String(this.config.cpuLimit),
      "--pids-limit",
      String(this.config.pidsLimit),
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--tmpfs",
      `/tmp:rw,noexec,nosuid,size=${this.config.tmpfsMb}m`,
      this.config.defaultImage,
      "sleep",
      "infinity"
    ]);
  }

  async startSession(providerSessionId: string): Promise<void> {
    this.requireManagedName(providerSessionId);
    await this.run(["start", providerSessionId]);
  }

  async stopSession(providerSessionId: string): Promise<void> {
    this.requireManagedName(providerSessionId);
    await this.run(["stop", "--time", "5", providerSessionId]);
  }

  async resetSession(providerSessionId: string): Promise<void> {
    this.requireManagedName(providerSessionId);

    const labels = await this.inspectLabels(providerSessionId);
    const image = await this.inspectImage(providerSessionId);

    this.requireAllowedImage(image);
    await this.requireNonRootImage(image);

    await this.run(["rm", "-f", providerSessionId]);

    await this.run([
      "create",
      "--name",
      providerSessionId,
      "--label",
      "tlp.managed=true",
      "--label",
      `tlp.user_id=${labels.userId}`,
      "--label",
      `tlp.definition_stable_id=${labels.definitionStableId}`,
      "--label",
      `tlp.definition_version=${labels.definitionVersion}`,
      "--network",
      "none",
      "--memory",
      `${this.config.memoryMb}m`,
      "--cpus",
      String(this.config.cpuLimit),
      "--pids-limit",
      String(this.config.pidsLimit),
      "--read-only",
      "--cap-drop",
      "ALL",
      "--security-opt",
      "no-new-privileges",
      "--tmpfs",
      `/tmp:rw,noexec,nosuid,size=${this.config.tmpfsMb}m`,
      image,
      "sleep",
      "infinity"
    ]);
  }

  async destroySession(providerSessionId: string): Promise<void> {
    this.requireManagedName(providerSessionId);

    if (!(await this.sessionExists(providerSessionId))) return;

    await this.run(["rm", "-f", providerSessionId]);
  }

  async sessionExists(providerSessionId: string): Promise<boolean> {
    this.requireManagedName(providerSessionId);

    try {
      await this.run([
        "inspect",
        "--type",
        "container",
        providerSessionId
      ]);
      return true;
    } catch {
      return false;
    }
  }

  async sessionRunning(providerSessionId: string): Promise<boolean> {
    this.requireManagedName(providerSessionId);

    const result = await this.run([
      "inspect",
      "--format",
      "{{.State.Running}}",
      providerSessionId
    ]);

    return result.stdout.trim() === "true";
  }

  async inspectSecurity(
    providerSessionId: string
  ): Promise<ContainerRuntimeSecurityState> {
    this.requireManagedName(providerSessionId);

    const result = await this.run([
      "inspect",
      providerSessionId
    ]);

    const parsed = JSON.parse(result.stdout) as Array<{
      Config?: { User?: string };
      HostConfig?: {
        Privileged?: boolean;
        NetworkMode?: string;
        ReadonlyRootfs?: boolean;
        CapDrop?: string[] | null;
        SecurityOpt?: string[] | null;
      };
      Mounts?: Array<{ Destination?: string; Source?: string }>;
    }>;

    const container = parsed[0];
    if (!container) {
      throw new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Container runtime returned no inspection data",
        retryable: true
      });
    }

    const user = (container.Config?.User ?? "").trim().toLowerCase();
    const securityOptions = container.HostConfig?.SecurityOpt ?? [];
    const capDrop = container.HostConfig?.CapDrop ?? [];
    const mounts = container.Mounts ?? [];

    return {
      nonRootImageUser:
        Boolean(user) && user !== "0" && user !== "root",
      privileged: Boolean(container.HostConfig?.Privileged),
      networkMode: String(container.HostConfig?.NetworkMode ?? ""),
      readonlyRootfs: Boolean(container.HostConfig?.ReadonlyRootfs),
      capDropAll: capDrop.some(
        (capability) => capability.toUpperCase() === "ALL"
      ),
      noNewPrivileges: securityOptions.some((option) =>
        option.toLowerCase().includes("no-new-privileges")
      ),
      dockerSocketMounted: mounts.some((mount) => {
        const destination = (mount.Destination ?? "").toLowerCase();
        const source = (mount.Source ?? "").toLowerCase();
        return (
          destination.includes("docker.sock") ||
          source.includes("docker.sock")
        );
      })
    };
  }

  private async inspectImage(
    providerSessionId: string
  ): Promise<string> {
    const result = await this.run([
      "inspect",
      "--format",
      "{{.Config.Image}}",
      providerSessionId
    ]);

    const image = result.stdout.trim();
    if (!image) {
      throw new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Container image reference is unavailable",
        retryable: true
      });
    }
    return image;
  }

  private async inspectLabels(providerSessionId: string): Promise<{
    userId: string;
    definitionStableId: string;
    definitionVersion: string;
  }> {
    const result = await this.run([
      "inspect",
      "--format",
      "{{json .Config.Labels}}",
      providerSessionId
    ]);

    const labels = JSON.parse(result.stdout) as Record<string, string>;

    if (labels["tlp.managed"] !== "true") {
      throw new AppError({
        code: "FORBIDDEN",
        message: "Refusing to operate on an unmanaged container",
        retryable: false
      });
    }

    const userId = labels["tlp.user_id"];
    const definitionStableId = labels["tlp.definition_stable_id"];
    const definitionVersion = labels["tlp.definition_version"];

    if (!userId || !definitionStableId || !definitionVersion) {
      throw new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Managed container metadata is incomplete",
        retryable: true
      });
    }

    return {
      userId,
      definitionStableId,
      definitionVersion
    };
  }

  private async requireNonRootImage(image: string): Promise<void> {
    const result = await this.run([
      "image",
      "inspect",
      "--format",
      "{{.Config.User}}",
      image
    ]);

    const user = result.stdout.trim().toLowerCase();

    if (!user || user === "0" || user === "root") {
      throw new AppError({
        code: "FORBIDDEN",
        message:
          "Container lab images must declare a non-root default user",
        retryable: false
      });
    }
  }

  private requireAllowedImage(image: string): void {
    if (!this.config.allowedImages.includes(image)) {
      throw new AppError({
        code: "FORBIDDEN",
        message: "Container image is not in the approved allowlist",
        retryable: false
      });
    }
  }

  private requireManagedName(providerSessionId: string): void {
    if (!/^tlp-container-[a-f0-9-]{36}$/.test(providerSessionId)) {
      throw new AppError({
        code: "VALIDATION_ERROR",
        message: "Invalid managed Container Provider session identifier",
        retryable: false
      });
    }
  }

  private requireEnabled(): void {
    if (!this.config.enabled) {
      throw new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message: "Container Provider is disabled",
        retryable: false
      });
    }
  }

  private async run(args: string[]): Promise<ExecResult> {
    try {
      return await this.execute(
        this.config.binary,
        args,
        this.config.commandTimeoutMs
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Container runtime command failed";

      throw new AppError({
        code: "DEPENDENCY_UNAVAILABLE",
        message,
        retryable: true
      });
    }
  }
}
