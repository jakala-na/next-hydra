import { RuntimeEnvironmentPublisher } from "@repo/cli-core/runtime-environment";
import { createCanonicalContentSearchProjection } from "@repo/search/content-search-projection";
import { ConfigProvider, Effect, Layer, Redacted } from "effect";
import { describe, expect, it, vi } from "vitest";

import { AlgoliaAdministration } from "./administration";
import { AlgoliaProvisioningConfig } from "./config";
import { provisionAlgolia } from "./provision";

const forbidden = () =>
  Effect.die(
    new Error("Content-only provisioning must not configure Commerce")
  );
describe("Content-only provisioning", () => {
  it("publishes a Content-only runtime key without connector operations or pricing configuration", async () => {
    const configureIndex = vi.fn<
      AlgoliaAdministration["Service"]["configureIndex"]
    >(() => Effect.void);
    const configureSearchKey = vi.fn<
      AlgoliaAdministration["Service"]["configureSearchKey"]
    >(() => Effect.succeed(Redacted.make("search-key")));
    const publish = vi.fn<RuntimeEnvironmentPublisher["Service"]["publish"]>(
      () =>
        Effect.succeed({
          destination: "local",
          mode: 0o600,
          path: "/tmp/content-search.env",
        })
    );
    const prepare = vi.fn<RuntimeEnvironmentPublisher["Service"]["prepare"]>(
      ({ manifest }) =>
        Effect.succeed({
          destination: "local",
          manifest: [...manifest],
          path: "/tmp/content-search.env",
        })
    );
    const receipt = await provisionAlgolia({
      contentProjection: createCanonicalContentSearchProjection("content"),
      destination: {
        destination: "local",
        output: "/tmp/content-search.env",
        publicationMode: "create",
        yes: true,
      },
      indexPrefix: undefined,
      locales: ["en-US"],
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          AlgoliaProvisioningConfig.layer.pipe(
            Layer.provide(
              ConfigProvider.layer(
                ConfigProvider.fromEnv({
                  env: {
                    ALGOLIA_ADMIN_API_KEY: "admin",
                    ALGOLIA_APPLICATION_ID: "app",
                    ALGOLIA_REGION: "us",
                  },
                })
              )
            )
          ),
          AlgoliaAdministration.layerFrom({
            configureAlgoliaDestinationAuthentication: forbidden,
            configureAlgoliaTransformationSecrets: forbidden,
            configureCommercetoolsAuthentication: forbidden,
            configureCommercetoolsConnector: forbidden,
            configureConnectorKey: forbidden,
            configureIndex,
            configureQuerySuggestions: () => Effect.void,
            configureSearchKey,
            findCommercetoolsAuthentication: forbidden,
          }),
          RuntimeEnvironmentPublisher.layerFrom({ prepare, publish })
        )
      ),
      Effect.runPromise
    );
    expect(receipt).toMatchObject({
      connectors: 0,
      contentIndices: 1,
      productPrimaries: 0,
      productReplicas: 0,
      querySuggestions: 1,
    });
    expect(
      configureIndex.mock.calls.map(([request]) => request.indexName)
    ).toEqual(["content"]);
    expect(configureSearchKey).toHaveBeenCalledWith(
      expect.objectContaining({
        indexNames: ["content", "query-suggestions--en-US"],
      })
    );
    expect(prepare.mock.calls[0]?.[0].manifest.map(({ key }) => key)).toEqual([
      "ALGOLIA_APPLICATION_ID",
      "ALGOLIA_SEARCH_API_KEY",
    ]);
    expect(publish.mock.calls[0]?.[1]).not.toHaveProperty(
      "ALGOLIA_PRICE_CUSTOMER_GROUP_IDS"
    );
  });
});
