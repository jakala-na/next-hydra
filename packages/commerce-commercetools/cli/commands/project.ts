import chalk from "chalk";
import type { ConfigProvider, Effect as EffectType } from "effect";
import { Console, Effect, Option, Schema } from "effect";
import { CliError, Command, Flag } from "effect/unstable/cli";

import {
  createCommerceCliLayer,
  createProjectProvisioningCliLayer,
} from "../layer";
import {
  decodeErrorDetails,
  decodedErrorMessage,
  providerErrorSummary,
} from "../project-provisioning/error-details";
import { RuntimeClientCreationOutcomeUnknown } from "../project-provisioning/model";
import { provisionCommerceProject } from "../project-provisioning/provision";
import { seedCommerceProject } from "../project-provisioning/seed";

export const projectUserMessage = (cause: unknown): string | undefined => {
  const message = decodedErrorMessage(cause);
  const providerSummary = providerErrorSummary(
    decodeErrorDetails(cause)?.cause
  );
  const lines = message === undefined ? [] : [message];

  if (providerSummary !== undefined && providerSummary !== message) {
    lines.push(`Commercetools response: ${providerSummary}`);
  }

  if (Schema.is(RuntimeClientCreationOutcomeUnknown)(cause)) {
    lines.push(
      `Runtime API Client: ${cause.clientName}`,
      "Creation may have succeeded; check API Clients before retrying"
    );
  }

  return lines.length === 0 ? undefined : lines.join("\n  ");
};

const asUserError = <A, E, R>(effect: EffectType.Effect<A, E, R>) =>
  effect.pipe(
    Effect.mapError(
      (cause) =>
        new CliError.UserError({
          cause,
          userMessage: projectUserMessage(cause),
        })
    )
  );

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
      output: Flag.string("output").pipe(
        Flag.withDescription(
          "New dotenv file for the application runtime credentials"
        )
      ),
    },
    ({ clientName, output }) => {
      const runtimeClientName = Option.getOrUndefined(clientName);
      const program =
        runtimeClientName === undefined
          ? provisionCommerceProject({ output })
          : provisionCommerceProject({
              clientName: runtimeClientName,
              output,
            });

      return asUserError(program).pipe(
        Effect.flatMap((receipt) =>
          Console.log(chalk.green("✓ Commercetools project provisioned")).pipe(
            Effect.andThen(
              Console.log(`  Runtime API Client: ${receipt.runtimeClientId}`)
            ),
            Effect.andThen(
              Console.log(`  Credentials: ${receipt.credentialFile.path}`)
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
