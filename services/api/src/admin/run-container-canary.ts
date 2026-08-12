import {
  createConfiguredContainerCanaryRuntime,
  runContainerProviderCanary
} from "../container-canary";

async function main(): Promise<void> {
  const { config, runtime } =
    createConfiguredContainerCanaryRuntime();

  const result = await runContainerProviderCanary(
    runtime,
    config
  );

  process.stdout.write(
    `${JSON.stringify(result, null, 2)}\n`
  );

  if (!result.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  const message =
    error instanceof Error ? error.message : String(error);

  process.stderr.write(
    `Container Provider canary failed: ${message}\n`
  );

  process.exitCode = 1;
});
