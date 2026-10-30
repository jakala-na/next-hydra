import { renderReport, withCommandOutput } from "@repo/cli-core/command-output";
import type { RuntimeEnvironmentPublisher } from "@repo/cli-core/runtime-environment";
import {
  runtimeEnvironmentDestinationFlags,
  runtimeEnvironmentDestinationFromFlags,
} from "@repo/cli-core/runtime-environment-cli";
import chalk from "chalk";
import type { ConfigProvider, Layer, Effect as EffectType } from "effect";
import { Console, Effect, Option, Schema } from "effect";
import { CliError, Command, Flag } from "effect/unstable/cli";

import {
  createCommerceCliLayer,
  createProjectProvisioningCliLayer,
} from "../layer";
import type { CommercetoolsProjectAdministration } from "../project-provisioning/administration";
import type { BootstrapCommercetoolsConfig } from "../project-provisioning/bootstrap-config";
import {
  decodeErrorDetails,
  decodedErrorMessage,
  providerErrorSummary,
} from "../project-provisioning/error-details";
import { RuntimeClientCreationOutcomeUnknown } from "../project-provisioning/model";
import { commerceProvisioningReport } from "../project-provisioning/output";
import { provisionCommerceProject } from "../project-provisioning/provision";
import type { RuntimeProjectSetup } from "../project-provisioning/runtime-project-setup";
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

type ProvisioningLayer<E, R> = Layer.Layer<
  | BootstrapCommercetoolsConfig
  | CommercetoolsProjectAdministration
  | RuntimeProjectSetup
  | RuntimeEnvironmentPublisher,
  Layer.Error<ReturnType<typeof createProjectProvisioningCliLayer<E, R>>>,
  Layer.Services<ReturnType<typeof createProjectProvisioningCliLayer<E, R>>>
>;

export const createProjectCommand = <E, R>(
  configProvider: EffectType.Effect<ConfigProvider.ConfigProvider, E, R>,
  provisioningLayer: ProvisioningLayer<
    E,
    R
  > = createProjectProvisioningCliLayer(configProvider)
) => {
  const runtimeLayer = createCommerceCliLayer(configProvider);
  const provision = Command.make(
    "provision",
    {
      clientName: Flag.String("client-name").pipe(
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

      return withCommandOutput(
        {
          title: "Provision Commerce",
          context: "commercetools",
          failureNote:
            "Earlier project changes may remain. Read the failed phase and provider error before retrying.",
        },
        (style) =>
          asUserError(program).pipe(
            Effect.flatMap((receipt) =>
              Console.log(
                renderReport(commerceProvisioningReport(receipt), style)
              )
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
