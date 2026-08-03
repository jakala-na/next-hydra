import { Config, Context, Effect, Layer, Redacted } from "effect";

interface CommercetoolsConfigValue {
  readonly projectKey: string;
  readonly clientId: string;
  readonly clientSecret: Redacted.Redacted<string>;
  readonly scope: string;
  readonly region: string;
}

export class CommercetoolsConfig extends Context.Service<
  CommercetoolsConfig,
  CommercetoolsConfigValue
>()("@repo/commerce-commercetools/CommercetoolsConfig") {
  static readonly layer = Layer.effect(
    CommercetoolsConfig,
    Effect.gen(function* () {
      const projectKey = yield* Config.nonEmptyString(
        "COMMERCETOOLS_PROJECT_KEY"
      );
      const clientId = yield* Config.nonEmptyString("COMMERCETOOLS_CLIENT_ID");
      const clientSecret = yield* Config.nonEmptyString(
        "COMMERCETOOLS_CLIENT_SECRET"
      ).pipe(Config.map(Redacted.make));
      const scope = yield* Config.nonEmptyString("COMMERCETOOLS_SCOPE");
      const region = yield* Config.nonEmptyString("COMMERCETOOLS_REGION");

      return CommercetoolsConfig.of({
        projectKey,
        clientId,
        clientSecret,
        scope,
        region,
      });
    })
  );

  static readonly testLayer = Layer.succeed(
    CommercetoolsConfig,
    CommercetoolsConfig.of({
      projectKey: "test-project",
      clientId: "test-client",
      clientSecret: Redacted.make("test-secret"),
      scope: "manage_project:test-project",
      region: "us-central1.gcp",
    })
  );
}
