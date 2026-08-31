import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer, Redacted } from "effect";

import { BootstrapCommercetoolsConfig } from "./bootstrap-config";

const configuration = {
  CTP_API_URL: "https://api.us-central1.gcp.commercetools.com",
  CTP_AUTH_URL: "https://auth.us-central1.gcp.commercetools.com",
  CTP_CLIENT_ID: "bootstrap-client",
  CTP_CLIENT_SECRET: "bootstrap-secret",
  CTP_PROJECT_KEY: "starter-project",
  CTP_SCOPES:
    "manage_project_settings:starter-project manage_api_clients:starter-project",
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
        apiUrl: "https://api.us-central1.gcp.commercetools.com",
        authUrl: "https://auth.us-central1.gcp.commercetools.com",
        clientId: "bootstrap-client",
        projectKey: "starter-project",
        region: "us-central1.gcp",
        scopes: [
          "manage_project_settings:starter-project",
          "manage_api_clients:starter-project",
        ],
      });
      expect(Redacted.isRedacted(config.clientSecret)).toBeTruthy();
      expect(Redacted.value(config.clientSecret)).toBe("bootstrap-secret");
    })
  );

  it.effect("does not accept runtime output as bootstrap input", () =>
    Effect.gen(function* () {
      const exit = yield* loadBootstrapConfig({
        COMMERCETOOLS_CLIENT_ID: "runtime-client",
        COMMERCETOOLS_CLIENT_SECRET: "runtime-secret",
        COMMERCETOOLS_PROJECT_KEY: "starter-project",
        COMMERCETOOLS_REGION: "us-central1.gcp",
        COMMERCETOOLS_SCOPE: "manage_project:starter-project",
      }).pipe(Effect.exit);

      expect(exit._tag).toBe("Failure");
    })
  );
});
