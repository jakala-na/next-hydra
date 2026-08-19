import { describe, expect, it } from "@effect/vitest";
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
import type { RegistrationQueryRecord } from "@repo/registration/services/registration-queries";
import { RegistrationQueries } from "@repo/registration/services/registration-queries";
import { Effect, Redacted } from "effect";
import { afterAll, beforeAll } from "vitest";

const requiredEnv = [
  "COMMERCETOOLS_PROJECT_KEY",
  "COMMERCETOOLS_CLIENT_ID",
  "COMMERCETOOLS_CLIENT_SECRET",
  "COMMERCETOOLS_SCOPE",
  "COMMERCETOOLS_REGION",
] as const;

const hasRequiredEnv = requiredEnv.every((name) => {
  const value = process.env[name];

  return value !== undefined && value.length > 0;
});
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
    createdAt,
    details: new CompanyRegistrationDetails({
      address: new CompanyAddress({
        city: Redacted.make(City.make("New York"), { label: "city" }),
        country: CountryCode.make("US"),
        postalCode: Redacted.make(PostalCode.make("10001"), {
          label: "postalCode",
        }),
        streetName: Redacted.make(AddressLine.make("1 Computation Way"), {
          label: "addressLine",
        }),
      }),
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
    }),
    id: RegistrationId.make(id),
    status: "awaiting_approval",
    storeKey: StoreKey.make("default-store"),
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
    createdAt: registration.createdAt,
    decision: new RejectedDecision({
      actor: reviewer,
      decidedAt: createdAt,
      decision: "rejected",
    }),
    details: registration.details,
    id: registration.id,
    status: "rejected",
    storeKey: registration.storeKey,
    updatedAt: registration.updatedAt,
  });
};

const getLiveApiRoot = async () => {
  const [{ commercetoolsRestClientLayer }, { CommercetoolsRestClient }] =
    await Promise.all([
      import("../client/layers"),
      import("../client/rest-client"),
    ]);

  return await Effect.runPromise(
    Effect.gen(function* () {
      const { apiRoot } = yield* CommercetoolsRestClient;

      return apiRoot;
    }).pipe(Effect.provide(commercetoolsRestClientLayer))
  );
};

const seedLiveRegistrations = async () => {
  const apiRoot = await getLiveApiRoot();
  const { encodeRegistrationStorageValue } =
    await import("./registration-queries");
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

  await Promise.all(
    registrations.map(async (registration) => {
      const value = await Effect.runPromise(
        encodeRegistrationStorageValue(registration)
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
    })
  );
};

const deleteLiveRegistrations = async () => {
  const apiRoot = await getLiveApiRoot();

  await Promise.all(
    seededKeys.map(async (key) => {
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
    })
  );
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
  for (const [index, current] of items.entries()) {
    const previous = items[index - 1];

    if (previous !== undefined) {
      expect(compare(previous, current)).toBeTruthy();
    }
  }
};

describeLive("registrationQueriesLayer live", () => {
  beforeAll(seedLiveRegistrations);

  afterAll(deleteLiveRegistrations);

  it.effect(
    "pages registrations through Commercetools without the admin UI",
    () =>
      Effect.gen(function* () {
        const { registrationQueriesLayer } = yield* Effect.promise(
          async () => await import("./registration-queries")
        );
        const layer = registrationQueriesLayer({
          container: liveContainer,
        });

        yield* Effect.gen(function* () {
          const queries = yield* RegistrationQueries;
          const firstPage = yield* queries.list({ limit: 1 });

          expect(firstPage.items.length).toBeLessThanOrEqual(1);

          const [firstItem] = firstPage.items;
          if (firstItem === undefined || firstPage.nextCursor === undefined) {
            return;
          }

          const secondPage = yield* queries.list({
            cursor: firstPage.nextCursor,
            limit: 1,
          });
          const [secondItem] = secondPage.items;

          if (secondItem === undefined) {
            return;
          }

          expect(secondItem.id).not.toBe(firstItem.id);
          expect(compareNewestFirst(firstItem, secondItem)).toBeTruthy();
        }).pipe(Effect.provide(layer));
      })
  );

  it.effect("sorts live registrations by last modified ascending", () =>
    Effect.gen(function* () {
      const { registrationQueriesLayer } = yield* Effect.promise(
        async () => await import("./registration-queries")
      );
      const layer = registrationQueriesLayer({
        container: liveContainer,
      });

      yield* Effect.gen(function* () {
        const queries = yield* RegistrationQueries;
        const firstPage = yield* queries.list({
          limit: 2,
          sort: { direction: "asc", field: "lastModifiedAt" },
        });

        const secondPage =
          firstPage.nextCursor === undefined
            ? { items: [] }
            : yield* queries.list({
                cursor: firstPage.nextCursor,
                limit: 2,
                sort: { direction: "asc", field: "lastModifiedAt" },
              });
        const items = [...firstPage.items, ...secondPage.items];

        expectOrdered(items, compareOldestFirst);
        expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
      }).pipe(Effect.provide(layer));
    })
  );

  it.effect("sorts live registrations by created time", () =>
    Effect.gen(function* () {
      const { registrationQueriesLayer } = yield* Effect.promise(
        async () => await import("./registration-queries")
      );
      const layer = registrationQueriesLayer({
        container: liveContainer,
      });

      yield* Effect.gen(function* () {
        const queries = yield* RegistrationQueries;
        const firstPage = yield* queries.list({
          limit: 2,
          sort: { direction: "asc", field: "createdAt" },
        });

        const secondPage =
          firstPage.nextCursor === undefined
            ? { items: [] }
            : yield* queries.list({
                cursor: firstPage.nextCursor,
                limit: 2,
                sort: { direction: "asc", field: "createdAt" },
              });
        const items = [...firstPage.items, ...secondPage.items];

        expectOrdered(items, compareCreatedFirst);
        expect(new Set(items.map((item) => item.id)).size).toBe(items.length);
      }).pipe(Effect.provide(layer));
    })
  );

  it.effect("combines status filtering with cursor pagination", () =>
    Effect.gen(function* () {
      const { registrationQueriesLayer } = yield* Effect.promise(
        async () => await import("./registration-queries")
      );
      const layer = registrationQueriesLayer({
        container: liveContainer,
      });

      yield* Effect.gen(function* () {
        const queries = yield* RegistrationQueries;
        const firstPage = yield* queries.list({
          limit: 1,
          status: "awaiting_approval",
        });

        expect(
          firstPage.items.map((item) => item.registration.status)
        ).toStrictEqual(["awaiting_approval"]);
        expect(firstPage.nextCursor).toBeDefined();

        const secondPage =
          firstPage.nextCursor === undefined
            ? { items: [] }
            : yield* queries.list({
                cursor: firstPage.nextCursor,
                limit: 1,
                status: "awaiting_approval",
              });

        expect(
          secondPage.items.map((item) => item.registration.status)
        ).toStrictEqual(["awaiting_approval"]);

        const registrationIds = new Set(
          [...firstPage.items, ...secondPage.items].map((item) =>
            String(item.registration.id)
          )
        );

        expect(
          registrationIds.has("registration-query-live-rejected")
        ).toBeFalsy();
      }).pipe(Effect.provide(layer));
    })
  );
});
