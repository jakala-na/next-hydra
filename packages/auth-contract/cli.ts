import {
  runtimeEnvironmentPublisherLayer,
  runtimeEnvironmentReceiptDescription,
} from "@repo/cli-core/runtime-environment";
import {
  runtimeEnvironmentDestinationFlags,
  runtimeEnvironmentDestinationFromFlags,
} from "@repo/cli-core/runtime-environment-cli";
import type { Effect as EffectType } from "effect";
import { Console, Effect, Layer } from "effect";
import { CliError, Command, Flag } from "effect/unstable/cli";

import { provisionAuth } from "./provisioning";
import type { AuthWebhookProvisioner } from "./provisioning";

const asUserError = <A, E, R>(effect: EffectType.Effect<A, E, R>) =>
  effect.pipe(Effect.mapError((cause) => new CliError.UserError({ cause })));

export const makeAuthCommand = <E, R>(
  providerLayer: Layer.Layer<AuthWebhookProvisioner, E, R>
) => {
  const provision = Command.make(
    "provision",
    {
      apiUrl: Flag.string("api-url").pipe(
        Flag.withDescription(
          "Public HTTPS base URL of the customer API application"
        )
      ),
      ...runtimeEnvironmentDestinationFlags(),
    },
    ({ apiUrl, ...destinationFlags }) =>
      asUserError(
        provisionAuth({
          apiUrl,
          destination: runtimeEnvironmentDestinationFromFlags(destinationFlags),
        })
      ).pipe(
        Effect.flatMap((receipt) =>
          Console.log(`✓ ${receipt.provider} customer auth provisioned`).pipe(
            Effect.andThen(
              Console.log(
                `  Webhook: ${receipt.endpointUrl} (${receipt.action})`
              )
            ),
            Effect.andThen(Console.log(`  Endpoint ID: ${receipt.endpointId}`)),
            Effect.andThen(
              Console.log(`  Events: ${receipt.events.join(", ")}`)
            ),
            Effect.andThen(
              Console.log(
                `  Signing secret: ${runtimeEnvironmentReceiptDescription(receipt.credentials)}`
              )
            )
          )
        )
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
