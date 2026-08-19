import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, Redacted } from "effect";

import { CommercetoolsConfig } from "./config";

const configuration = {
  COMMERCETOOLS_CLIENT_ID: "client-id",
  COMMERCETOOLS_CLIENT_SECRET: "client-secret",
  COMMERCETOOLS_PROJECT_KEY: "project-key",
  COMMERCETOOLS_REGION: "us-central1.gcp",
  COMMERCETOOLS_SCOPE: "manage_project:project-key",
} as const;

const loadConfig = (values: Record<string, string>) =>
  Effect.gen(function* () {
    return yield* CommercetoolsConfig;
  }).pipe(
    Effect.provide(
      CommercetoolsConfig.layer.pipe(
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(values)))
      )
    )
  );

describe(CommercetoolsConfig, () => {
  it.effect(
    "loads provider configuration and keeps the client secret redacted",
    () =>
      Effect.gen(function* () {
        const config = yield* loadConfig(configuration);

        expect(config).toMatchObject({
          clientId: "client-id",
          projectKey: "project-key",
          region: "us-central1.gcp",
          scope: "manage_project:project-key",
        });
        expect(String(config.clientSecret)).toBe("<redacted>");
        expect(Redacted.value(config.clientSecret)).toBe("client-secret");
      })
  );

  it.effect.each(Object.keys(configuration))(
    "rejects an empty %s value",
    (name) =>
      Effect.gen(function* () {
        const exit = yield* loadConfig({
          ...configuration,
          [name]: "",
        }).pipe(Effect.exit);

        expect(exit._tag).toBe("Failure");
      })
  );
});
