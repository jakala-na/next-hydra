import "dotenv/config";

import { describe, expect, it } from "@effect/vitest";
import {
  type RegistrationListItem,
  RegistrationQueries,
} from "@repo/registration-effect/services/registration-queries";
import { Effect } from "effect";
import { vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@repo/commerce/keys", () => ({
  keys: () => ({
    COMMERCETOOLS_CLIENT_ID: process.env.COMMERCETOOLS_CLIENT_ID,
    COMMERCETOOLS_CLIENT_SECRET: process.env.COMMERCETOOLS_CLIENT_SECRET,
    COMMERCETOOLS_PROJECT_KEY: process.env.COMMERCETOOLS_PROJECT_KEY,
    COMMERCETOOLS_REGION: process.env.COMMERCETOOLS_REGION,
    COMMERCETOOLS_SCOPE: process.env.COMMERCETOOLS_SCOPE,
    NEXT_PUBLIC_COMMERCETOOLS_PROJECT_KEY:
      process.env.NEXT_PUBLIC_COMMERCETOOLS_PROJECT_KEY,
    NEXT_PUBLIC_COMMERCETOOLS_REGION:
      process.env.NEXT_PUBLIC_COMMERCETOOLS_REGION,
  }),
}));

const requiredEnv = [
  "COMMERCETOOLS_PROJECT_KEY",
  "COMMERCETOOLS_CLIENT_ID",
  "COMMERCETOOLS_CLIENT_SECRET",
  "COMMERCETOOLS_SCOPE",
  "COMMERCETOOLS_REGION",
  "NEXT_PUBLIC_COMMERCETOOLS_PROJECT_KEY",
  "NEXT_PUBLIC_COMMERCETOOLS_REGION",
] as const;

const hasRequiredEnv = requiredEnv.every(
  (name) => process.env[name] && process.env[name].length > 0
);
const shouldRunLive = process.env.COMMERCETOOLS_LIVE_TESTS === "1";

const describeLive = shouldRunLive && hasRequiredEnv ? describe : describe.skip;

const compareNewestFirst = (
  left: RegistrationListItem,
  right: RegistrationListItem
) =>
  left.lastModifiedAt.getTime() > right.lastModifiedAt.getTime() ||
  (left.lastModifiedAt.getTime() === right.lastModifiedAt.getTime() &&
    left.id > right.id);

const compareOldestFirst = (
  left: RegistrationListItem,
  right: RegistrationListItem
) =>
  left.lastModifiedAt.getTime() < right.lastModifiedAt.getTime() ||
  (left.lastModifiedAt.getTime() === right.lastModifiedAt.getTime() &&
    left.id < right.id);

const compareCreatedFirst = (
  left: RegistrationListItem,
  right: RegistrationListItem
) =>
  left.createdAt.getTime() < right.createdAt.getTime() ||
  (left.createdAt.getTime() === right.createdAt.getTime() &&
    left.id < right.id);

const expectOrdered = (
  items: readonly RegistrationListItem[],
  compare: (left: RegistrationListItem, right: RegistrationListItem) => boolean
) => {
  for (let index = 1; index < items.length; index++) {
    const previous = items[index - 1];
    const current = items[index];

    if (!(previous && current)) {
      throw new Error("Expected adjacent items");
    }

    expect(compare(previous, current)).toBe(true);
  }
};

describeLive("layerCommercetoolsRegistrationQueries live", () => {
  it.live(
    "pages registrations through Commercetools without the admin UI",
    () =>
      Effect.gen(function* () {
        const { layerCommercetoolsRegistrationQueries } = yield* Effect.promise(
          () => import("./registration-queries")
        );
        const layer = layerCommercetoolsRegistrationQueries({
          batchSize: 2,
          container:
            process.env.COMMERCETOOLS_REGISTRATION_QUERY_CONTAINER ??
            "b2b-registration-by-id",
        });

        yield* Effect.gen(function* () {
          const queries = yield* RegistrationQueries;
          const firstPage = yield* queries.list({ limit: 1 });

          expect(firstPage.items.length).toBeLessThanOrEqual(1);

          const firstItem = firstPage.items[0];
          if (!(firstItem && firstPage.nextCursor)) {
            return;
          }

          const secondPage = yield* queries.list({
            cursor: firstPage.nextCursor,
            limit: 1,
          });
          const secondItem = secondPage.items[0];

          if (!secondItem) {
            return;
          }

          expect(secondItem.id).not.toBe(firstItem.id);
          expect(compareNewestFirst(firstItem, secondItem)).toBe(true);
        }).pipe(Effect.provide(layer));
      })
  );

  it.live("sorts live registrations by last modified ascending", () =>
    Effect.gen(function* () {
      const { layerCommercetoolsRegistrationQueries } = yield* Effect.promise(
        () => import("./registration-queries")
      );
      const layer = layerCommercetoolsRegistrationQueries({
        batchSize: 2,
        container:
          process.env.COMMERCETOOLS_REGISTRATION_QUERY_CONTAINER ??
          "b2b-registration-by-id",
      });

      yield* Effect.gen(function* () {
        const queries = yield* RegistrationQueries;
        const firstPage = yield* queries.list({
          limit: 2,
          sort: { field: "lastModifiedAt", direction: "asc" },
        });

        const secondPage = firstPage.nextCursor
          ? yield* queries.list({
              cursor: firstPage.nextCursor,
              limit: 2,
              sort: { field: "lastModifiedAt", direction: "asc" },
            })
          : { items: [] };
        const items = [...firstPage.items, ...secondPage.items];

        expectOrdered(items, compareOldestFirst);
        expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
      }).pipe(Effect.provide(layer));
    })
  );

  it.live("sorts live registrations by created time", () =>
    Effect.gen(function* () {
      const { layerCommercetoolsRegistrationQueries } = yield* Effect.promise(
        () => import("./registration-queries")
      );
      const layer = layerCommercetoolsRegistrationQueries({
        batchSize: 2,
        container:
          process.env.COMMERCETOOLS_REGISTRATION_QUERY_CONTAINER ??
          "b2b-registration-by-id",
      });

      yield* Effect.gen(function* () {
        const queries = yield* RegistrationQueries;
        const firstPage = yield* queries.list({
          limit: 2,
          sort: { field: "createdAt", direction: "asc" },
        });

        const secondPage = firstPage.nextCursor
          ? yield* queries.list({
              cursor: firstPage.nextCursor,
              limit: 2,
              sort: { field: "createdAt", direction: "asc" },
            })
          : { items: [] };
        const items = [...firstPage.items, ...secondPage.items];

        expectOrdered(items, compareCreatedFirst);
        expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
      }).pipe(Effect.provide(layer));
    })
  );
});
