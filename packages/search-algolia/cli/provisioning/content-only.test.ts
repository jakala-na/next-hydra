import {
  RuntimeEnvironmentPreflightError,
  RuntimeEnvironmentPublisher,
} from "@repo/cli-core/runtime-environment";
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
  it("rejects an unavailable output before changing provider resources", async () => {
    const error = await provisionAlgolia({
      contentIndexingOperations: ["upsert", "delete"],
      contentProjection: createCanonicalContentSearchProjection("content"),
      destination: {
        destination: "local",
        output: "/tmp/shared.env",
        publicationMode: "create",
        yes: true,
      },
      indexPrefix: undefined,
      locales: ["en-US"],
    }).pipe(
      Effect.provide(
        Layer.mergeAll(
          Layer.succeed(AlgoliaProvisioningConfig, {
            adminApiKey: Redacted.make("admin"),
            applicationId: "app",
            region: "us",
          }),
          AlgoliaAdministration.layerFrom({
            configureAlgoliaDestinationAuthentication: forbidden,
            configureAlgoliaTransformationSecrets: forbidden,
            configureCommercetoolsAuthentication: forbidden,
            configureCommercetoolsConnector: forbidden,
            configureConnectorKey: forbidden,
            configureContentKey: forbidden,
            configureIndex: forbidden,
            configureQuerySuggestions: forbidden,
            configureSearchKey: forbidden,
            findCommercetoolsAuthentication: forbidden,
          }),
          RuntimeEnvironmentPublisher.layerFrom({
            prepare: () =>
              Effect.fail(
                new RuntimeEnvironmentPreflightError({
                  cause: new Error("File already exists"),
                  destination: "local",
                  message: "Choose a new output file",
                  operation: "validation",
                })
              ),
            publish: forbidden,
          })
        )
      ),
      Effect.flip,
      Effect.runPromise
    );
    expect(error.message).toBe("Choose a new output file");
  });

  it.each(["local", "vercel"] as const)(
    "publishes both Content-only keys to one %s destination without Commerce credentials",
    async (store) => {
      const configureContentKey = vi.fn<
        AlgoliaAdministration["Service"]["configureContentKey"]
      >(() => Effect.succeed(Redacted.make("content-write-key")));
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
        ({ manifest, destination }) =>
          Effect.succeed(
            destination.destination === "local"
              ? { destination: "local", manifest, path: destination.output }
              : {
                  destination: "vercel",
                  environments: destination.environments,
                  manifest,
                  projects: [],
                  publicationMode: destination.publicationMode,
                }
          )
      );
      const { receipt } = await provisionAlgolia({
        contentIndexingOperations: ["search", "browse", "upsert", "delete"],
        contentProjection: createCanonicalContentSearchProjection("content"),
        destination:
          store === "local"
            ? {
                destination: "local",
                output: "/tmp/content-search.env",
                publicationMode: "create",
                yes: true,
              }
            : {
                destination: "vercel",
                environments: ["production"],
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
              configureContentKey,
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
      expect({
        contentKey: configureContentKey.mock.calls[0]?.[0],
        indices: configureIndex.mock.calls.map(
          ([request]) => request.indexName
        ),
        searchKey: configureSearchKey.mock.calls[0]?.[0],
      }).toMatchObject({
        contentKey: {
          indexNames: ["content"],
          operations: ["search", "browse", "upsert", "delete"],
        },
        indices: ["content"],
        searchKey: { indexNames: ["content", "query-suggestions--en-US"] },
      });
      expect(
        prepare.mock.calls.map(([{ destination, manifest }]) => ({
          destination: destination.destination,
          manifest,
        }))
      ).toEqual([
        {
          destination: store,
          manifest: [
            {
              applications: ["web"],
              key: "ALGOLIA_APPLICATION_ID",
              sensitive: false,
            },
            {
              applications: ["web"],
              key: "ALGOLIA_SEARCH_API_KEY",
              sensitive: true,
            },
            {
              applications: ["web"],
              key: "ALGOLIA_CONTENT_WRITE_API_KEY",
              sensitive: true,
            },
            {
              applications: ["web"],
              key: "ALGOLIA_CONTENT_INDEX_NAME",
              sensitive: false,
            },
          ],
        },
      ]);
      expect(publish.mock.calls).toEqual([
        [
          expect.objectContaining({ destination: store }),
          {
            ALGOLIA_APPLICATION_ID: "app",
            ALGOLIA_CONTENT_INDEX_NAME: "content",
            ALGOLIA_CONTENT_WRITE_API_KEY: Redacted.make("content-write-key"),
            ALGOLIA_SEARCH_API_KEY: Redacted.make("search-key"),
          },
        ],
      ]);
      expect(JSON.stringify(publish.mock.calls)).not.toContain(
        "content-write-key"
      );
    }
  );
});
