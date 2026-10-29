import { describe, expect, it } from "@effect/vitest";
import { CommerceCustomerId } from "@repo/commerce/domain/commerce-account";
import { CommerceLocale, StoreKey } from "@repo/commerce/store";
import { createClient } from "@urql/core";
import type { Exchange } from "@urql/core";
import { Effect, Layer } from "effect";
import { TestClock } from "effect/testing";
import { beforeEach, vi } from "vitest";
import { filter, map, pipe } from "wonka";

import { CommercetoolsGraphQLClient } from "../client/graphql-client";
import { CommercetoolsConfig } from "../config/config";
import type { ResolveCommercetoolsProductContextInput } from "./client";
import { CommercetoolsProductDiscoveryClient } from "./client";
import { commercetoolsProductDiscoveryClientLayer } from "./client-live";

const response = vi.fn<() => { readonly data: unknown }>();
const fixtureExchange: Exchange = () => (operations) =>
  pipe(
    operations,
    filter((operation) => operation.kind === "query"),
    map((operation) => ({
      ...response(),
      hasNext: false,
      operation,
      stale: false,
    }))
  );
const graphqlClientLayer = CommercetoolsGraphQLClient.testLayer(
  createClient({
    exchanges: [fixtureExchange],
    requestPolicy: "network-only",
    url: "https://commerce.example.test/graphql",
  })
);
const clientLayerFor = (config = CommercetoolsConfig.testLayer) =>
  commercetoolsProductDiscoveryClientLayer.pipe(
    Layer.provide(Layer.merge(graphqlClientLayer, config))
  );
const clientLayer = clientLayerFor();
const locale = CommerceLocale.make("en-US");

const resolveContext = (
  input: ResolveCommercetoolsProductContextInput,
  layer = clientLayer
) =>
  CommercetoolsProductDiscoveryClient.pipe(
    Effect.flatMap((client) => client.resolveProductContext(input)),
    Effect.provide(layer)
  );

const storeResponse = (id = "store-1") => ({
  data: {
    store: {
      distributionChannels: [{ id: "sales-channel", key: "sales" }],
      id,
      supplyChannels: [],
    },
  },
});

describe("Commercetools Store configuration cache", () => {
  beforeEach(() => response.mockReset());

  it.effect(
    "caches Store ID and Channels across buyers and request Layers",
    () =>
      Effect.gen(function* () {
        response
          .mockReturnValueOnce(storeResponse())
          .mockReturnValueOnce({
            data: { customer: { customerGroup: { id: "group-1" } } },
          })
          .mockReturnValueOnce({
            data: { customer: { customerGroup: { id: "group-2" } } },
          });
        const input = {
          locale,
          storeKey: StoreKey.make("cache-buyers"),
        };
        const first = yield* resolveContext({
          ...input,
          customerId: CommerceCustomerId.make("buyer-1"),
        });
        const second = yield* resolveContext({
          ...input,
          customerId: CommerceCustomerId.make("buyer-2"),
        });
        const anonymous = yield* resolveContext(input);
        expect(first.customerGroupId).toBe("group-1");
        expect(second.customerGroupId).toBe("group-2");
        expect(anonymous.customerGroupId).toBeUndefined();
        expect(response).toHaveBeenCalledTimes(3);
      })
  );

  it.effect("shares concurrent Store lookups", () =>
    Effect.gen(function* () {
      response.mockReturnValueOnce(storeResponse());
      const input = {
        locale,
        storeKey: StoreKey.make("cache-concurrent"),
      };
      const contexts = yield* Effect.all(
        [resolveContext(input), resolveContext(input)],
        { concurrency: "unbounded" }
      );
      expect(contexts.map(({ storeId }) => storeId)).toStrictEqual([
        "store-1",
        "store-1",
      ]);
      expect(response).toHaveBeenCalledOnce();
    })
  );

  it.effect("refreshes expired Store configuration", () =>
    Effect.gen(function* () {
      response
        .mockReturnValueOnce(storeResponse("before"))
        .mockReturnValueOnce(storeResponse("after"));
      const input = {
        locale,
        storeKey: StoreKey.make("cache-expiry"),
      };
      expect((yield* resolveContext(input)).storeId).toBe("before");
      yield* TestClock.adjust("1 day");
      expect((yield* resolveContext(input)).storeId).toBe("after");
      expect(response).toHaveBeenCalledTimes(2);
    })
  );

  it.effect("does not retain failed Store lookups", () =>
    Effect.gen(function* () {
      response
        .mockReturnValueOnce({ data: { store: null } })
        .mockReturnValueOnce(storeResponse());
      const input = {
        locale,
        storeKey: StoreKey.make("cache-failure"),
      };
      yield* resolveContext(input).pipe(Effect.flip);
      expect((yield* resolveContext(input)).storeId).toBe("store-1");
      expect(response).toHaveBeenCalledTimes(2);
    })
  );

  it.effect(
    "isolates cached Store configuration by project, region and Store key",
    () =>
      Effect.gen(function* () {
        const baseConfig = yield* CommercetoolsConfig.pipe(
          Effect.provide(CommercetoolsConfig.testLayer)
        );
        const configurations = [
          {
            projectKey: "cache-project-a",
            region: "us-central1.gcp",
            storeKey: "store-a",
          },
          {
            projectKey: "cache-project-b",
            region: "us-central1.gcp",
            storeKey: "store-a",
          },
          {
            projectKey: "cache-project-a",
            region: "europe-west1.gcp",
            storeKey: "store-a",
          },
          {
            projectKey: "cache-project-a",
            region: "us-central1.gcp",
            storeKey: "store-b",
          },
        ];
        for (const [
          index,
          { projectKey, region, storeKey },
        ] of configurations.entries()) {
          response.mockReturnValueOnce(storeResponse(`store-${index}`));
          const layer = clientLayerFor(
            Layer.succeed(CommercetoolsConfig, {
              ...baseConfig,
              projectKey,
              region,
            })
          );
          const context = yield* resolveContext(
            { locale, storeKey: StoreKey.make(storeKey) },
            layer
          );
          expect(context.storeId).toBe(`store-${index}`);
        }
        expect(response).toHaveBeenCalledTimes(4);
      })
  );
});
