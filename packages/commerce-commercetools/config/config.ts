import { Config, Context, Effect, Layer, Redacted, Schema } from "effect";

import {
  missingRuntimeScopes,
  runtimeScopeValidationMessage,
} from "./runtime-scopes";

const CommercetoolsEnvironment = Schema.Struct({
  COMMERCETOOLS_CLIENT_ID: Schema.NonEmptyString,
  COMMERCETOOLS_CLIENT_SECRET: Schema.Redacted(Schema.NonEmptyString),
  COMMERCETOOLS_PROJECT_KEY: Schema.NonEmptyString,
  COMMERCETOOLS_REGION: Schema.NonEmptyString,
  COMMERCETOOLS_SCOPE: Schema.NonEmptyString,
}).check(
  Schema.makeFilter((environment) => {
    const missingScopes = missingRuntimeScopes(
      environment.COMMERCETOOLS_PROJECT_KEY,
      environment.COMMERCETOOLS_SCOPE
    );

    return missingScopes.length === 0
      ? undefined
      : {
          issue: runtimeScopeValidationMessage(
            environment.COMMERCETOOLS_PROJECT_KEY,
            missingScopes
          ),
          path: ["COMMERCETOOLS_SCOPE"],
        };
  })
);

interface CommercetoolsConfigValue {
  readonly projectKey: string;
  readonly clientId: string;
  readonly clientSecret: Redacted.Redacted;
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
      const environment = yield* Config.schema(CommercetoolsEnvironment);

      return CommercetoolsConfig.of({
        clientId: environment.COMMERCETOOLS_CLIENT_ID,
        clientSecret: environment.COMMERCETOOLS_CLIENT_SECRET,
        projectKey: environment.COMMERCETOOLS_PROJECT_KEY,
        region: environment.COMMERCETOOLS_REGION,
        scope: environment.COMMERCETOOLS_SCOPE,
      });
    })
  );

  static readonly testLayer = Layer.succeed(
    CommercetoolsConfig,
    CommercetoolsConfig.of({
      clientId: "test-client",
      clientSecret: Redacted.make("test-secret"),
      projectKey: "test-project",
      region: "us-central1.gcp",
      scope: "manage_project:test-project",
    })
  );
}
