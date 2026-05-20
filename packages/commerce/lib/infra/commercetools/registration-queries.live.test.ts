import "dotenv/config";

import { describe, expect, it } from "@effect/vitest";
import {
  AddressLine,
  City,
  CompanyName,
  CountryCode,
  Email,
  PersonName,
  PostalCode,
  RegistrationId,
} from "@repo/registration-effect/domain/identity";
import {
  AwaitingApprovalRegistration,
  CompanyAddress,
  CompanyRegistrationDetails,
} from "@repo/registration-effect/domain/registration";
import {
  RegistrationQueries,
  type RegistrationQueryRecord,
} from "@repo/registration-effect/services/registration-queries";
import { Effect, Redacted } from "effect";
import { afterAll, beforeAll, vi } from "vitest";

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
const liveContainer = `registration-queries-live-${Date.now()}`;
const seededKeys = [
  "registration-query-live-a",
  "registration-query-live-b",
  "registration-query-live-c",
] as const;

const makeRegistration = (id: string, companyName: string, createdAt: Date) =>
  new AwaitingApprovalRegistration({
    _tag: "AwaitingApprovalRegistration",
    status: "awaiting_approval",
    id: RegistrationId.make(id),
    details: new CompanyRegistrationDetails({
      companyName: CompanyName.make(companyName),
      contactFirstName: Redacted.make(PersonName.make("Ada"), {
        label: "personName",
      }),
      contactLastName: Redacted.make(PersonName.make("Lovelace"), {
        label: "personName",
      }),
      email: Redacted.make(Email.make(`${id}@example.com`), {
        label: "email",
      }),
      address: new CompanyAddress({
        streetName: Redacted.make(AddressLine.make("1 Computation Way"), {
          label: "addressLine",
        }),
        postalCode: Redacted.make(PostalCode.make("10001"), {
          label: "postalCode",
        }),
        city: Redacted.make(City.make("New York"), { label: "city" }),
        country: CountryCode.make("US"),
      }),
    }),
    createdAt,
    updatedAt: createdAt,
  });

const seedLiveRegistrations = async () => {
  const { apiRoot } = await import("../../client/api-root");
  const { encodeRegistrationStorageValue } = await import(
    "./registration-queries"
  );
  const registrations = [
    makeRegistration(
      "registration-query-live-a",
      "Hydra Alpha",
      new Date("2026-01-01T00:00:00.000Z")
    ),
    makeRegistration(
      "registration-query-live-b",
      "Hydra Beta",
      new Date("2026-01-02T00:00:00.000Z")
    ),
    makeRegistration(
      "registration-query-live-c",
      "Hydra Gamma",
      new Date("2026-01-03T00:00:00.000Z")
    ),
  ];

  for (const registration of registrations) {
    const value = await Effect.runPromise(
      encodeRegistrationStorageValue(registration) as Effect.Effect<
        unknown,
        unknown,
        never
      >
    );

    await apiRoot
      .customObjects()
      .post({
        body: {
          container: liveContainer,
          key: String(registration.id),
          value,
        },
      })
      .execute();
  }
};

const deleteLiveRegistrations = async () => {
  const { apiRoot } = await import("../../client/api-root");

  for (const key of seededKeys) {
    try {
      const response = await apiRoot
        .customObjects()
        .withContainerAndKey({ container: liveContainer, key })
        .get()
        .execute();

      await apiRoot
        .customObjects()
        .withContainerAndKey({ container: liveContainer, key })
        .delete({
          queryArgs: {
            version: response.body.version,
          },
        })
        .execute();
    } catch {
      // Best-effort cleanup for live-test data.
    }
  }
};

const compareNewestFirst = (
  left: RegistrationQueryRecord,
  right: RegistrationQueryRecord
) =>
  left.lastModifiedAt.getTime() > right.lastModifiedAt.getTime() ||
  (left.lastModifiedAt.getTime() === right.lastModifiedAt.getTime() &&
    left.id > right.id);

const compareOldestFirst = (
  left: RegistrationQueryRecord,
  right: RegistrationQueryRecord
) =>
  left.lastModifiedAt.getTime() < right.lastModifiedAt.getTime() ||
  (left.lastModifiedAt.getTime() === right.lastModifiedAt.getTime() &&
    left.id < right.id);

const compareCreatedFirst = (
  left: RegistrationQueryRecord,
  right: RegistrationQueryRecord
) =>
  left.createdAt.getTime() < right.createdAt.getTime() ||
  (left.createdAt.getTime() === right.createdAt.getTime() &&
    left.id < right.id);

const expectOrdered = (
  items: readonly RegistrationQueryRecord[],
  compare: (
    left: RegistrationQueryRecord,
    right: RegistrationQueryRecord
  ) => boolean
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
  beforeAll(seedLiveRegistrations);
  afterAll(deleteLiveRegistrations);

  it.live(
    "pages registrations through Commercetools without the admin UI",
    () =>
      Effect.gen(function* () {
        const { layerCommercetoolsRegistrationQueries } = yield* Effect.promise(
          () => import("./registration-queries")
        );
        const layer = layerCommercetoolsRegistrationQueries({
          batchSize: 2,
          container: liveContainer,
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
        container: liveContainer,
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
        container: liveContainer,
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
