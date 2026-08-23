import type { ConfigProvider, Effect as EffectType } from "effect";
import { Console, Effect } from "effect";
import { CliError, Command, Flag, Prompt } from "effect/unstable/cli";

import { createContentstackProvisioningLayer } from "./layer";
import { CONTENTSTACK_ENVIRONMENTS } from "./provisioning/model";
import { provisionContentstack } from "./provisioning/provision";

const asUserError = <A, E, R>(effect: EffectType.Effect<A, E, R>) =>
  effect.pipe(Effect.mapError((cause) => new CliError.UserError({ cause })));

export const createCmsCommand = <E, R>(
  configProvider: EffectType.Effect<ConfigProvider.ConfigProvider, E, R>
) => {
  const provisioningLayer = createContentstackProvisioningLayer(configProvider);
  const provision = Command.make(
    "provision",
    {
      environment: Flag.choice("environment", CONTENTSTACK_ENVIRONMENTS).pipe(
        Flag.withDescription("Environment used by the generated runtime file"),
        Flag.withDefault("development")
      ),
      localUrl: Flag.string("local-url").pipe(
        Flag.withDescription("Local application URL for Contentstack previews"),
        Flag.withDefault("http://localhost:3001")
      ),
      managementTokenAlias: Flag.string("management-token-alias").pipe(
        Flag.withDescription(
          "Local csdx alias for the target stack Management Token"
        )
      ),
      output: Flag.string("output").pipe(
        Flag.withDescription(
          "New dotenv file for Contentstack runtime credentials"
        )
      ),
      productionUrl: Flag.string("production-url").pipe(
        Flag.withDescription(
          "Production application URL for Contentstack previews"
        ),
        Flag.withFallbackPrompt(
          Prompt.text({ message: "Production application URL" })
        )
      ),
      stackMasterLocale: Flag.string("stack-master-locale").pipe(
        Flag.withDescription(
          "Target stack master locale used to map the English starter entries"
        ),
        Flag.withDefault("en-us")
      ),
    },
    ({
      environment,
      localUrl,
      managementTokenAlias,
      output,
      productionUrl,
      stackMasterLocale,
    }) => {
      const provisioningOptions = {
        environment,
        localUrl,
        managementTokenAlias,
        output,
        productionUrl,
        stackMasterLocale,
      };

      return asUserError(provisionContentstack(provisioningOptions)).pipe(
        Effect.flatMap((receipt) =>
          Console.log("✓ Contentstack stack provisioned").pipe(
            Effect.andThen(Console.log(`  Stack API Key: ${receipt.apiKey}`)),
            Effect.andThen(
              Console.log(`  Environments: ${receipt.environments.join(", ")}`)
            ),
            Effect.andThen(Console.log(`  Region: ${receipt.region}`)),
            Effect.andThen(
              Console.log(`  Credentials: ${receipt.credentialFile.path}`)
            ),
            Effect.andThen(
              Console.log(
                "  Live Preview: configure the stack-level local and production preview URLs manually"
              )
            ),
            Effect.andThen(
              Console.log(
                `  Management Token alias retained locally: ${managementTokenAlias}`
              )
            )
          )
        )
      );
    }
  ).pipe(
    Command.withDescription(
      "Import the starter content model and write runtime credentials"
    ),
    Command.provide(provisioningLayer)
  );

  return Command.make("cms", {}, () => Effect.void).pipe(
    Command.withDescription("Contentstack CMS administration commands"),
    Command.withSubcommands([provision])
  );
};
