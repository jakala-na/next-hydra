// biome-ignore-all lint/suspicious/noMisplacedAssertion: Assertions run inside Effect programs executed by the test helper.

import { StoreKey } from "@repo/commerce/store";
import { RegistrationReviewerActor } from "@repo/registration/domain/actors";
import { RejectedDecision } from "@repo/registration/domain/approval";
import {
  AddressLine,
  AuthUserId,
  City,
  CompanyName,
  CountryCode,
  Email,
  PersonName,
  PostalCode,
  RegistrationId,
} from "@repo/registration/domain/identity";
import {
  AwaitingApprovalRegistration,
  CompanyAddress,
  CompanyRegistrationDetails,
  RejectedRegistration,
} from "@repo/registration/domain/registration";
import {
  RegistrationQueries,
  type RegistrationQueryRecord,
} from "@repo/registration/services/registration-queries";
import { Effect, Redacted } from "effect";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

const itEffect = (
  name: string,
  effect: () => Effect.Effect<unknown, unknown, never>
) => it(name, () => Effect.runPromise(effect()));

vi.mock("server-only", () => ({}));
vi.mock("@repo/commerce/keys", () => ({
  keys: () => ({
    COMMERCETOOLS_CLIENT_ID: process.env.COMMERCETOOLS_CLIENT_ID,
    COMMERCETOOLS_CLIENT_SECRET: process.env.COMMERCETOOLS_CLIENT_SECRET,
    COMMERCETOOLS_PROJECT_KEY: process.env.COMMERCETOOLS_PROJECT_KEY,
    COMMERCETOOLS_REGION: process.env.COMMERCETOOLS_REGION,
    COMMERCETOOLS_SCOPE: process.env.COMMERCETOOLS_SCOPE,
  }),
}));

const requiredEnv = [
  "COMMERCETOOLS_PROJECT_KEY",
  "COMMERCETOOLS_CLIENT_ID",
  "COMMERCETOOLS_CLIENT_SECRET",
  "COMMERCETOOLS_SCOPE",
  "COMMERCETOOLS_REGION",
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
  "registration-query-live-rejected",
] as const;

const reviewer = new RegistrationReviewerActor({
  actorType: "registration_reviewer",
  authUserId: AuthUserId.make("auth-reviewer-live"),
  email: Redacted.make(Email.make("reviewer@example.com"), {
    label: "email",
  }),
  name: "Registration Reviewer",
});

const makeRegistration = (id: string, companyName: string, createdAt: Date) =>
  new AwaitingApprovalRegistration({
    _tag: "AwaitingApprovalRegistration",
    status: "awaiting_approval",
    id: RegistrationId.make(id),
    storeKey: StoreKey.make("default-store"),
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

const makeRejectedRegistration = (
  id: string,
  companyName: string,
  createdAt: Date
) => {
  const registration = makeRegistration(id, companyName, createdAt);

  return new RejectedRegistration({
    _tag: "RejectedRegistration",
    status: "rejected",
    id: registration.id,
    storeKey: registration.storeKey,
    details: registration.details,
    decision: new RejectedDecision({
      decision: "rejected",
      actor: reviewer,
      decidedAt: createdAt,
    }),
    createdAt: registration.createdAt,
    updatedAt: registration.updatedAt,
  });
};

const seedLiveRegistrations = async () => {
  const { apiRoot } = await import("@repo/commerce/lib/client/api-root");
  const { encodeRegistrationStorageValue } = await import(
    "./commercetools-registration-queries"
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
    makeRejectedRegistration(
      "registration-query-live-rejected",
      "Hydra Rejected",
      new Date("2026-01-04T00:00:00.000Z")
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
  const { apiRoot } = await import("@repo/commerce/lib/client/api-root");

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

  itEffect(
    "pages registrations through Commercetools without the admin UI",
    () =>
      Effect.gen(function* () {
        const { layerCommercetoolsRegistrationQueries } = yield* Effect.promise(
          () => import("./commercetools-registration-queries")
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

  itEffect("sorts live registrations by last modified ascending", () =>
    Effect.gen(function* () {
      const { layerCommercetoolsRegistrationQueries } = yield* Effect.promise(
        () => import("./commercetools-registration-queries")
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

  itEffect("sorts live registrations by created time", () =>
    Effect.gen(function* () {
      const { layerCommercetoolsRegistrationQueries } = yield* Effect.promise(
        () => import("./commercetools-registration-queries")
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

  itEffect("combines status filtering with cursor pagination", () =>
    Effect.gen(function* () {
      const { layerCommercetoolsRegistrationQueries } = yield* Effect.promise(
        () => import("./commercetools-registration-queries")
      );
      const layer = layerCommercetoolsRegistrationQueries({
        batchSize: 2,
        container: liveContainer,
      });

      yield* Effect.gen(function* () {
        const queries = yield* RegistrationQueries;
        const firstPage = yield* queries.list({
          limit: 1,
          status: "awaiting_approval",
        });

        expect(firstPage.items).toHaveLength(1);
        expect(firstPage.items[0]?.registration.status).toBe(
          "awaiting_approval"
        );
        expect(firstPage.nextCursor).toBeDefined();

        const secondPage = firstPage.nextCursor
          ? yield* queries.list({
              cursor: firstPage.nextCursor,
              limit: 1,
              status: "awaiting_approval",
            })
          : { items: [] };

        expect(secondPage.items).toHaveLength(1);
        expect(secondPage.items[0]?.registration.status).toBe(
          "awaiting_approval"
        );

        const registrationIds = new Set(
          [...firstPage.items, ...secondPage.items].map((item) =>
            String(item.registration.id)
          )
        );

        expect(registrationIds.has("registration-query-live-rejected")).toBe(
          false
        );
      }).pipe(Effect.provide(layer));
    })
  );
});
