import { describe, expect, it } from "@effect/vitest";
import { ConfigProvider, Effect, Layer } from "effect";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));

import { CommercetoolsGraphQLClient } from "./graphql-client";
import { commercetoolsClientsLayer } from "./layers";
import { CommercetoolsRestClient } from "./rest-client";

const configurationLayer = ConfigProvider.layer(
  ConfigProvider.fromUnknown({
    COMMERCETOOLS_PROJECT_KEY: "test-project",
    COMMERCETOOLS_CLIENT_ID: "test-client",
    COMMERCETOOLS_CLIENT_SECRET: "test-secret",
    COMMERCETOOLS_SCOPE: "manage_project:test-project",
    COMMERCETOOLS_REGION: "us-central1.gcp",
  })
);

describe("Commercetools clients", () => {
  it.effect(
    "constructs the REST and GraphQL Services from provider config",
    () =>
      Effect.gen(function* () {
        const rest = yield* CommercetoolsRestClient;
        const graphql = yield* CommercetoolsGraphQLClient;

        expect(typeof rest.apiRoot.graphql).toBe("function");
        expect(typeof graphql.query).toBe("function");
      }).pipe(
        Effect.provide(
          commercetoolsClientsLayer.pipe(Layer.provide(configurationLayer))
        )
      )
  );
});
