import { runtimeEnvironmentReceiptDescription } from "@repo/cli-core/runtime-environment";
import {
  runtimeEnvironmentDestinationFlags,
  runtimeEnvironmentDestinationFromFlags,
} from "@repo/cli-core/runtime-environment-cli";
import chalk from "chalk";
import type { ConfigProvider, Effect as EffectType } from "effect";
import { Console, Effect, Option } from "effect";
import { CliError, Command, Flag } from "effect/unstable/cli";

import {
  createCommerceCliLayer,
  createProjectProvisioningCliLayer,
} from "../layer";
import { provisionCommerceProject } from "../project-provisioning/provision";
import { seedCommerceProject } from "../project-provisioning/seed";

const asUserError = <A, E, R>(effect: EffectType.Effect<A, E, R>) =>
  effect.pipe(Effect.mapError((cause) => new CliError.UserError({ cause })));

export const createProjectCommand = <E, R>(
  configProvider: EffectType.Effect<ConfigProvider.ConfigProvider, E, R>
) => {
  const provisioningLayer = createProjectProvisioningCliLayer(configProvider);
  const runtimeLayer = createCommerceCliLayer(configProvider);
  const provision = Command.make(
    "provision",
    {
      clientName: Flag.string("client-name").pipe(
        Flag.withDescription("Name for the application runtime API Client"),
        Flag.optional
      ),
      ...runtimeEnvironmentDestinationFlags(),
    },
    ({ clientName, ...destinationFlags }) => {
      const runtimeClientName = Option.getOrUndefined(clientName);
      const destination =
        runtimeEnvironmentDestinationFromFlags(destinationFlags);
      const program =
        runtimeClientName === undefined
          ? provisionCommerceProject({ destination })
          : provisionCommerceProject({
              clientName: runtimeClientName,
              destination,
            });

      return asUserError(program).pipe(
        Effect.flatMap((receipt) =>
          Console.log(chalk.green("✓ Commercetools project provisioned")).pipe(
            Effect.andThen(
              Console.log(`  Runtime API Client: ${receipt.runtimeClientId}`)
            ),
            Effect.andThen(
              Console.log(
                `  Credentials: ${runtimeEnvironmentReceiptDescription(receipt.credentials)}`
              )
            ),
            Effect.andThen(
              Console.log(
                `  Migrations applied: ${receipt.seed.migrationsApplied}`
              )
            ),
            Effect.andThen(Console.log("  Bootstrap API Client: revoked"))
          )
        )
      );
    }
  ).pipe(
    Command.withDescription(
      "Prepare a project and replace its bootstrap API Client"
    ),
    Command.provide(provisioningLayer)
  );

  const seed = Command.make("seed", {}, () =>
    asUserError(seedCommerceProject()).pipe(
      Effect.flatMap((receipt) =>
        Console.log(chalk.green("✓ Commercetools project seeded")).pipe(
          Effect.andThen(
            Console.log(`  Migrations applied: ${receipt.migrationsApplied}`)
          )
        )
      )
    )
  ).pipe(
    Command.withDescription("Apply starter-kit migrations"),
    Command.provide(runtimeLayer)
  );

  return Command.make("project", {}, () => Effect.void).pipe(
    Command.withDescription("Commercetools project setup commands"),
    Command.withSubcommands([provision, seed])
  );
};
