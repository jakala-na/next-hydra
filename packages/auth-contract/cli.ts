import { renderReport, withCommandOutput } from "@repo/cli-core/command-output";
import { runtimeEnvironmentPublisherLayer } from "@repo/cli-core/runtime-environment";
import {
  runtimeEnvironmentDestinationFlags,
  runtimeEnvironmentDestinationFromFlags,
} from "@repo/cli-core/runtime-environment-cli";
import type { Effect as EffectType } from "effect";
import { Console, Effect, Layer } from "effect";
import { CliError, Command, Flag } from "effect/unstable/cli";

import { authProvisioningReport } from "./output";
import { provisionAuth } from "./provisioning";
import { AuthWebhookProvisioner } from "./provisioning";

const asUserError = <A, E, R>(effect: EffectType.Effect<A, E, R>) =>
  effect.pipe(Effect.mapError((cause) => new CliError.UserError({ cause })));

export const makeAuthCommand = <E, R>(
  providerLayer: Layer.Layer<AuthWebhookProvisioner, E, R>
) => {
  const provision = Command.make(
    "provision",
    {
      apiUrl: Flag.String("api-url").pipe(
        Flag.withDescription(
          "Public HTTPS base URL of the customer API application"
        )
      ),
      ...runtimeEnvironmentDestinationFlags(),
    },
    ({ apiUrl, ...destinationFlags }) =>
      withCommandOutput(
        {
          title: "Provision authentication",
          context: apiUrl,
          failureNote:
            "The webhook may already exist. Read the provider error and publication destination before retrying.",
        },
        (style) =>
          Effect.gen(function* () {
            const provisioner = yield* AuthWebhookProvisioner;
            const receipt = yield* asUserError(
              provisionAuth({
                apiUrl,
                destination:
                  runtimeEnvironmentDestinationFromFlags(destinationFlags),
              })
            );
            yield* Console.log(
              renderReport(
                authProvisioningReport(receipt, provisioner.runtimeEnvironment),
                style
              )
            );
          })
      )
  ).pipe(
    Command.withDescription(
      "Create the selected customer identity provider webhook once"
    ),
    Command.provide(
      Layer.merge(providerLayer, runtimeEnvironmentPublisherLayer)
    )
  );

  return Command.make("auth", {}, () => Effect.void).pipe(
    Command.withDescription("Customer authentication administration commands"),
    Command.withSubcommands([provision])
  );
};
