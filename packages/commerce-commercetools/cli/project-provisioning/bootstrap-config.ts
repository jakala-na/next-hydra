import type { Redacted } from "effect";
import { Config, Context, Effect, Layer } from "effect";

import { ApiClientId, CommercetoolsRegion, ProjectKey } from "./model";

interface BootstrapCommercetoolsConfigValue {
  readonly apiUrl: string;
  readonly authUrl: string;
  readonly clientId: ApiClientId;
  readonly clientSecret: Redacted.Redacted;
  readonly projectKey: ProjectKey;
  readonly region: CommercetoolsRegion;
  readonly scopes: readonly string[];
}

export class BootstrapCommercetoolsConfig extends Context.Service<
  BootstrapCommercetoolsConfig,
  BootstrapCommercetoolsConfigValue
>()("@repo/commerce-commercetools/BootstrapConfig") {
  static readonly layer = Layer.effect(
    BootstrapCommercetoolsConfig,
    Effect.gen(function* () {
      const projectKey = yield* Config.nonEmptyString("CTP_PROJECT_KEY").pipe(
        Config.map((value) => ProjectKey.make(value))
      );
      const clientId = yield* Config.nonEmptyString("CTP_CLIENT_ID").pipe(
        Config.map((value) => ApiClientId.make(value))
      );
      const clientSecret = yield* Config.redacted("CTP_CLIENT_SECRET");
      const authUrl = yield* Config.url("CTP_AUTH_URL");
      const apiUrl = yield* Config.url("CTP_API_URL");
      const scopes = yield* Config.nonEmptyString("CTP_SCOPES").pipe(
        Config.map((value) => value.split(/\s+/u))
      );
      const region = CommercetoolsRegion.make(
        apiUrl.hostname
          .replace(/^api\./u, "")
          .replace(/\.commercetools\.com$/u, "")
      );

      return BootstrapCommercetoolsConfig.of({
        apiUrl: apiUrl.origin,
        authUrl: authUrl.origin,
        clientId,
        clientSecret,
        projectKey,
        region,
        scopes,
      });
    })
  );
}
