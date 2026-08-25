import {
  PrivateDotEnvFile,
  privateDotEnvFileLayer,
} from "@repo/cli-core/private-dotenv";
import {
  Config,
  ConfigProvider,
  Effect,
  FileSystem,
  Layer,
  Option,
  Path,
  Redacted,
  Terminal,
} from "effect";
import type { Effect as EffectType } from "effect";
import { Prompt } from "effect/unstable/cli";

import {
  ContentstackCredentialInputError,
  ContentstackRuntimeCredentials,
} from "./model";
import {
  ContentstackRuntimeCredentialHandoff,
  ContentstackRuntimeCredentialInput,
} from "./runtime-credentials";

const runtimeEnvironment = (credentials: ContentstackRuntimeCredentials) => ({
  CONTENTSTACK_API_KEY: credentials.apiKey,
  CONTENTSTACK_DELIVERY_TOKEN: Redacted.value(credentials.deliveryToken),
  CONTENTSTACK_ENVIRONMENT: credentials.environment,
  CONTENTSTACK_GRAPHQL_HOST_NAME: credentials.graphqlHost,
  CONTENTSTACK_LIVE_PREVIEW_HOST_NAME: credentials.graphqlPreviewHost,
  CONTENTSTACK_PREVIEW_TOKEN: Redacted.value(credentials.previewToken),
  CONTENTSTACK_REGION: credentials.region,
  CONTENTSTACK_WEBHOOK_SECRET: Redacted.value(credentials.webhookSecret),
  NEXT_PUBLIC_CONTENTSTACK_API_KEY: credentials.apiKey,
  NEXT_PUBLIC_CONTENTSTACK_ENVIRONMENT: credentials.environment,
});

export const createContentstackRuntimeCredentialInputLayer = <E, R>(
  configProvider: EffectType.Effect<ConfigProvider.ConfigProvider, E, R>
) =>
  Layer.effect(
    ContentstackRuntimeCredentialInput,
    Effect.gen(function* () {
      const fileSystem = yield* FileSystem.FileSystem;
      const path = yield* Path.Path;
      const terminal = yield* Terminal.Terminal;
      const deliveryTokenConfig = yield* Config.option(
        Config.redacted("CONTENTSTACK_DELIVERY_TOKEN")
      );
      const previewTokenConfig = yield* Config.option(
        Config.redacted("CONTENTSTACK_PREVIEW_TOKEN")
      );
      const webhookSecret = yield* Config.option(
        Config.redacted("CONTENTSTACK_WEBHOOK_SECRET")
      ).pipe(
        Effect.map((configured) =>
          Option.getOrElse(configured, () => Redacted.make(""))
        )
      );
      const configuredDeliveryToken = deliveryTokenConfig.pipe(
        Option.filter((value) => Redacted.value(value).trim().length > 0)
      );
      const configuredPreviewToken = previewTokenConfig.pipe(
        Option.filter((value) => Redacted.value(value).trim().length > 0)
      );

      return ContentstackRuntimeCredentialInput.of({
        acquire: Effect.fn("ContentstackRuntimeCredentialInput.acquire")(
          function* (apiKey, environment, endpoints) {
            if (
              Option.isSome(configuredDeliveryToken) &&
              Option.isSome(configuredPreviewToken)
            ) {
              return new ContentstackRuntimeCredentials({
                apiKey,
                deliveryToken: configuredDeliveryToken.value,
                environment,
                graphqlHost: endpoints.graphqlHost,
                graphqlPreviewHost: endpoints.graphqlPreviewHost,
                previewToken: configuredPreviewToken.value,
                region: endpoints.region,
                webhookSecret,
              });
            }

            if (
              Option.isSome(configuredDeliveryToken) ||
              Option.isSome(configuredPreviewToken)
            ) {
              return yield* new ContentstackCredentialInputError({
                cause: new Error(
                  "CONTENTSTACK_DELIVERY_TOKEN and CONTENTSTACK_PREVIEW_TOKEN must be provided together"
                ),
                message:
                  "The configured Contentstack runtime tokens are incomplete",
              });
            }

            const prompt = (tokenType: "Delivery" | "Preview") =>
              Prompt.password({
                message: `${tokenType} Token for ${environment}`,
                validate: (value) =>
                  value.trim().length === 0
                    ? Effect.fail(`${tokenType} Token cannot be empty`)
                    : Effect.succeed(value),
              });

            const tokens = yield* Prompt.run(
              Prompt.all({
                deliveryToken: prompt("Delivery"),
                previewToken: prompt("Preview"),
              })
            ).pipe(
              Effect.provideService(FileSystem.FileSystem, fileSystem),
              Effect.provideService(Path.Path, path),
              Effect.provideService(Terminal.Terminal, terminal),
              Effect.mapError(
                (cause) =>
                  new ContentstackCredentialInputError({
                    cause,
                    message:
                      "Contentstack runtime credential entry was cancelled",
                  })
              )
            );

            return new ContentstackRuntimeCredentials({
              apiKey,
              deliveryToken: tokens.deliveryToken,
              environment,
              graphqlHost: endpoints.graphqlHost,
              graphqlPreviewHost: endpoints.graphqlPreviewHost,
              previewToken: tokens.previewToken,
              region: endpoints.region,
              webhookSecret,
            });
          }
        ),
      });
    })
  ).pipe(Layer.provide(ConfigProvider.layer(configProvider)));

export const contentstackRuntimeCredentialHandoffLayer = Layer.effect(
  ContentstackRuntimeCredentialHandoff,
  Effect.gen(function* () {
    const privateDotEnvFile = yield* PrivateDotEnvFile;

    return ContentstackRuntimeCredentialHandoff.of({
      save: Effect.fn("ContentstackCredentialHandoff.save")(
        function* (credentials, destination) {
          return yield* privateDotEnvFile.publish(
            runtimeEnvironment(credentials),
            destination
          );
        }
      ),
    });
  })
).pipe(Layer.provide(privateDotEnvFileLayer));
