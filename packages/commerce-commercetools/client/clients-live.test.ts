import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";

import { CommercetoolsGraphQLClient } from "./graphql-client";
import { commercetoolsClientsLayer } from "./layers";
import { CommercetoolsRestClient } from "./rest-client";

const configurationLayer = ConfigProvider.layer(
  ConfigProvider.fromUnknown({
    COMMERCETOOLS_CLIENT_ID: "test-client",
    COMMERCETOOLS_CLIENT_SECRET: "test-secret",
    COMMERCETOOLS_PROJECT_KEY: "test-project",
    COMMERCETOOLS_REGION: "us-central1.gcp",
    COMMERCETOOLS_SCOPE: "manage_project:test-project",
  })
);

describe("Commercetools clients", () => {
  it.effect(
    "constructs the REST and GraphQL Services from provider config",
    () =>
      Effect.gen(function* () {
        const rest = yield* CommercetoolsRestClient;
        const graphql = yield* CommercetoolsGraphQLClient;

        expect(rest.apiRoot).toHaveProperty("graphql", expect.any(Function));
        expect(graphql.query).toStrictEqual(expect.any(Function));
        expect(graphql.mutation).toStrictEqual(expect.any(Function));
      }).pipe(
        Effect.provide(
          commercetoolsClientsLayer.pipe(Layer.provide(configurationLayer))
        )
      )
  );
});
