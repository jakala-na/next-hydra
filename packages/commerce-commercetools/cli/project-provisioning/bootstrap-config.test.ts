import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, Redacted } from "effect";

import { BootstrapCommercetoolsConfig } from "./bootstrap-config";

const configuration = {
  COMMERCETOOLS_BOOTSTRAP_CLIENT_ID: "bootstrap-client",
  COMMERCETOOLS_BOOTSTRAP_CLIENT_SECRET: "bootstrap-secret",
  COMMERCETOOLS_PROJECT_KEY: "starter-project",
  COMMERCETOOLS_REGION: "us-central1.gcp",
} as const;

const loadBootstrapConfig = (values: Record<string, string>) =>
  BootstrapCommercetoolsConfig.pipe(
    Effect.provide(
      BootstrapCommercetoolsConfig.layer.pipe(
        Layer.provide(ConfigProvider.layer(ConfigProvider.fromUnknown(values)))
      )
    )
  );

describe(BootstrapCommercetoolsConfig, () => {
  it.effect("uses dedicated bootstrap keys and redacts the secret", () =>
    Effect.gen(function* () {
      const config = yield* loadBootstrapConfig(configuration);

      expect(config).toMatchObject({
        clientId: "bootstrap-client",
        projectKey: "starter-project",
        region: "us-central1.gcp",
      });
      expect(Redacted.isRedacted(config.clientSecret)).toBeTruthy();
      expect(Redacted.value(config.clientSecret)).toBe("bootstrap-secret");
    })
  );

  it.effect("does not accept the runtime client keys as bootstrap access", () =>
    Effect.gen(function* () {
      const exit = yield* loadBootstrapConfig({
        COMMERCETOOLS_CLIENT_ID: "runtime-client",
        COMMERCETOOLS_CLIENT_SECRET: "runtime-secret",
        COMMERCETOOLS_PROJECT_KEY: "starter-project",
        COMMERCETOOLS_REGION: "us-central1.gcp",
      }).pipe(Effect.exit);

      expect(exit._tag).toBe("Failure");
    })
  );
});
