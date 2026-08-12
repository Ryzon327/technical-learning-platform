import {
  activateContainerProvider,
  disableContainerProvider,
  getContainerProviderRolloutPolicy,
  suspendContainerProvider
} from "../container-rollout";

function requiredFlag(
  args: string[],
  name: string
): string {
  const index = args.indexOf(name);

  if (index < 0 || !args[index + 1]) {
    throw new Error(`Missing required flag ${name}`);
  }

  return String(args[index + 1]);
}

function optionalFlag(
  args: string[],
  name: string
): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const action = args[0];

  if (action === "status") {
    process.stdout.write(
      `${JSON.stringify(
        await getContainerProviderRolloutPolicy(),
        null,
        2
      )}\n`
    );
    return;
  }

  const actorUserId = requiredFlag(args, "--actor");

  if (action === "activate") {
    const rolloutMode = requiredFlag(
      args,
      "--mode"
    ) as "allowlist" | "percentage" | "all";

    const percentageRaw = optionalFlag(
      args,
      "--percentage"
    );

    const allowedUserIds = args
      .flatMap((value, index) =>
        value === "--user" && args[index + 1]
          ? [String(args[index + 1])]
          : []
      );

    const policy = await activateContainerProvider({
      actorUserId,
      rolloutMode,
      ...(percentageRaw
        ? { rolloutPercentage: Number(percentageRaw) }
        : {}),
      ...(allowedUserIds.length
        ? { allowedUserIds }
        : {})
    });

    process.stdout.write(
      `${JSON.stringify(policy, null, 2)}\n`
    );
    return;
  }

  if (action === "suspend") {
    const reason = requiredFlag(args, "--reason");

    process.stdout.write(
      `${JSON.stringify(
        await suspendContainerProvider({
          actorUserId,
          reason
        }),
        null,
        2
      )}\n`
    );
    return;
  }

  if (action === "disable") {
    const reason = requiredFlag(args, "--reason");

    process.stdout.write(
      `${JSON.stringify(
        await disableContainerProvider({
          actorUserId,
          reason
        }),
        null,
        2
      )}\n`
    );
    return;
  }

  throw new Error(
    "Usage: status | activate --actor <id> --mode allowlist|percentage|all [--user <id>] [--percentage <1-100>] | suspend --actor <id> --reason <text> | disable --actor <id> --reason <text>"
  );
}

main().catch((error) => {
  process.stderr.write(
    `${error instanceof Error ? error.message : String(error)}\n`
  );
  process.exitCode = 1;
});
