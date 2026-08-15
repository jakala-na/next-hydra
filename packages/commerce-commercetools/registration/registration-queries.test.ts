// oxlint-disable vitest/no-standalone-expect -- Assertions run inside Effect programs executed by the test helper.

import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { StoreKey } from "@repo/commerce/store";
import {
  AddressLine,
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
  Registration,
} from "@repo/registration/domain/registration";
import {
  RegistrationQueries,
  RegistrationQueryFailure,
  RegistrationQueryInvalidCursor,
} from "@repo/registration/services/registration-queries";
import { encodeJsonString } from "@repo/versioned-store";
import type { Schema } from "effect";
import { Effect, Redacted } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  encodeRegistrationStorageValue,
  registrationQueriesLayerFrom,
} from "./registration-queries";

const itEffect = (
  name: string,
  effect: () => Effect.Effect<unknown, unknown, never>
) => it(name, () => Effect.runPromise(effect()));

vi.mock("server-only", () => ({}));

interface CustomObjectsGetRequest {
  readonly queryArgs?: { readonly where?: string };
}

const execute = vi.fn();
const get = vi.fn((_request?: CustomObjectsGetRequest) => ({ execute }));
const withContainer = vi.fn(() => ({ get }));
const customObjects = vi.fn(() => ({ withContainer }));
const apiRoot = { customObjects } as unknown as ByProjectKeyRequestBuilder;

const container = "b2b-registration-by-id";
const layer = registrationQueriesLayerFrom({ apiRoot, container });

const makeDetails = (companyName: string) =>
  new CompanyRegistrationDetails({
    companyName: CompanyName.make(companyName),
    contactFirstName: Redacted.make(PersonName.make("Ada"), {
      label: "personName",
    }),
    contactLastName: Redacted.make(PersonName.make("Lovelace"), {
      label: "personName",
    }),
    email: Redacted.make(Email.make("ada@example.com"), { label: "email" }),
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
  });

const makeAwaiting = (id: string, companyName = "Hydra Supplies") =>
  new AwaitingApprovalRegistration({
    _tag: "AwaitingApprovalRegistration",
    status: "awaiting_approval",
    id: RegistrationId.make(id),
    storeKey: StoreKey.make("default-store"),
    details: makeDetails(companyName),
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  });

const customObject = (
  id: string,
  lastModifiedAt: string,
  registration: Registration
) =>
  Effect.gen(function* () {
    return {
      createdAt: registration.createdAt.toISOString(),
      id,
      lastModifiedAt,
      value: yield* encodeJsonString(Registration, registration),
    };
  }) as Effect.Effect<
    {
      readonly createdAt: string;
      readonly id: string;
      readonly lastModifiedAt: string;
      readonly value: string;
    },
    Schema.SchemaError,
    never
  >;

beforeEach(() => {
  customObjects.mockClear();
  withContainer.mockClear();
  get.mockClear();
  execute.mockReset();
});

describe("registrationQueriesLayer", () => {
  itEffect("queries custom objects by lastModifiedAt and id cursor order", () =>
    Effect.gen(function* () {
      execute.mockResolvedValueOnce({
        body: {
          results: [
            yield* customObject(
              "custom-object-3",
              "2026-01-03T00:00:00.000Z",
              makeAwaiting("registration-3", "Hydra Three")
            ),
            yield* customObject(
              "custom-object-2",
              "2026-01-02T00:00:00.000Z",
              makeAwaiting("registration-2", "Hydra Two")
            ),
          ],
        },
      });
      const queries = yield* RegistrationQueries;

      const result = yield* queries.list({ limit: 1 });

      expect(result.items.map((item) => String(item.registration.id))).toEqual([
        "registration-3",
      ]);
      expect(result.nextCursor).toBeDefined();
      expect(withContainer).toHaveBeenCalledWith({ container });
      expect(get).toHaveBeenCalledWith({
        queryArgs: {
          limit: 2,
          offset: 0,
          sort: ["lastModifiedAt desc", "id desc"],
          where: "value(storeKey is defined)",
          withTotal: false,
        },
      });
    }).pipe(Effect.provide(layer))
  );

  itEffect("uses the opaque cursor as a Commercetools seek predicate", () =>
    Effect.gen(function* () {
      execute.mockResolvedValueOnce({
        body: {
          results: [
            yield* customObject(
              "custom-object-3",
              "2026-01-03T00:00:00.000Z",
              makeAwaiting("registration-3")
            ),
            yield* customObject(
              "custom-object-2",
              "2026-01-02T00:00:00.000Z",
              makeAwaiting("registration-2")
            ),
          ],
        },
      });
      execute.mockResolvedValueOnce({
        body: {
          results: [
            yield* customObject(
              "custom-object-2",
              "2026-01-02T00:00:00.000Z",
              makeAwaiting("registration-2")
            ),
            yield* customObject(
              "custom-object-1",
              "2026-01-01T00:00:00.000Z",
              makeAwaiting("registration-1")
            ),
          ],
        },
      });
      const queries = yield* RegistrationQueries;

      const firstPage = yield* queries.list({ limit: 1 });
      expect(firstPage.nextCursor).toBeDefined();
      const cursor = firstPage.nextCursor;
      if (!cursor) {
        throw new Error("Expected a next cursor");
      }
      const secondPage = yield* queries.list({
        cursor,
        limit: 1,
      });

      expect(
        secondPage.items.map((item) => String(item.registration.id))
      ).toEqual(["registration-2"]);
      expect(get).toHaveBeenLastCalledWith({
        queryArgs: {
          limit: 2,
          offset: 0,
          sort: ["lastModifiedAt desc", "id desc"],
          where:
            'value(storeKey is defined) and (lastModifiedAt < "2026-01-03T00:00:00.000Z" or (lastModifiedAt = "2026-01-03T00:00:00.000Z" and id < "custom-object-3"))',
          withTotal: false,
        },
      });
    }).pipe(Effect.provide(layer))
  );

  itEffect("pushes status filtering into the provider predicate", () =>
    Effect.gen(function* () {
      execute.mockResolvedValueOnce({
        body: {
          results: [
            yield* customObject(
              "custom-object-2",
              "2026-01-02T00:00:00.000Z",
              makeAwaiting("registration-2")
            ),
            yield* customObject(
              "custom-object-1",
              "2026-01-01T00:00:00.000Z",
              makeAwaiting("registration-1")
            ),
          ],
        },
      });
      const queries = yield* RegistrationQueries;

      const result = yield* queries.list({
        limit: 1,
        status: "awaiting_approval",
      });

      expect(execute).toHaveBeenCalledTimes(1);
      expect(result.items.map((item) => String(item.registration.id))).toEqual([
        "registration-2",
      ]);
      expect(result.nextCursor).toBeDefined();
      expect(get).toHaveBeenCalledWith({
        queryArgs: {
          limit: 2,
          offset: 0,
          sort: ["lastModifiedAt desc", "id desc"],
          where:
            'value(storeKey is defined) and value(status = "awaiting_approval")',
          withTotal: false,
        },
      });
    }).pipe(Effect.provide(layer))
  );

  itEffect("combines status and cursor predicates in one provider query", () =>
    Effect.gen(function* () {
      execute.mockResolvedValueOnce({
        body: {
          results: [
            yield* customObject(
              "custom-object-3",
              "2026-01-03T00:00:00.000Z",
              makeAwaiting("registration-3")
            ),
            yield* customObject(
              "custom-object-2",
              "2026-01-02T00:00:00.000Z",
              makeAwaiting("registration-2")
            ),
          ],
        },
      });
      execute.mockResolvedValueOnce({
        body: {
          results: [
            yield* customObject(
              "custom-object-2",
              "2026-01-02T00:00:00.000Z",
              makeAwaiting("registration-2")
            ),
          ],
        },
      });
      const queries = yield* RegistrationQueries;

      const firstPage = yield* queries.list({
        limit: 1,
        status: "awaiting_approval",
      });
      const cursor = firstPage.nextCursor;
      if (!cursor) {
        throw new Error("Expected a next cursor");
      }
      const secondPage = yield* queries.list({
        cursor,
        limit: 1,
        status: "awaiting_approval",
      });

      expect(
        secondPage.items.map((item) => String(item.registration.id))
      ).toEqual(["registration-2"]);
      expect(get).toHaveBeenLastCalledWith({
        queryArgs: {
          limit: 2,
          offset: 0,
          sort: ["lastModifiedAt desc", "id desc"],
          where:
            'value(storeKey is defined) and value(status = "awaiting_approval") and (lastModifiedAt < "2026-01-03T00:00:00.000Z" or (lastModifiedAt = "2026-01-03T00:00:00.000Z" and id < "custom-object-3"))',
          withTotal: false,
        },
      });
    }).pipe(Effect.provide(layer))
  );

  itEffect("decodes storage status values without persisting _tag", () =>
    Effect.gen(function* () {
      const registration = makeAwaiting("registration-1");
      const customObjectValue =
        yield* encodeRegistrationStorageValue(registration);

      expect(customObjectValue).toMatchObject({
        status: "awaiting_approval",
      });
      expect(Object.hasOwn(customObjectValue as object, "_tag")).toBe(false);

      execute.mockResolvedValueOnce({
        body: {
          results: [
            {
              createdAt: registration.createdAt.toISOString(),
              id: "custom-object-1",
              lastModifiedAt: "2026-01-01T00:00:00.000Z",
              value: customObjectValue,
            },
          ],
        },
      });
      const queries = yield* RegistrationQueries;

      const result = yield* queries.list({ limit: 1 });

      expect(result.items.map((item) => String(item.registration.id))).toEqual([
        "registration-1",
      ]);
    }).pipe(Effect.provide(layer))
  );

  itEffect(
    "eligibility lookup excludes registrations without a Store Key",
    () =>
      Effect.gen(function* () {
        const legacyRegistration = makeAwaiting("legacy-registration");
        const encodedLegacyValue =
          yield* encodeRegistrationStorageValue(legacyRegistration);
        if (
          typeof encodedLegacyValue !== "object" ||
          encodedLegacyValue === null ||
          Array.isArray(encodedLegacyValue)
        ) {
          throw new Error("Expected an encoded Registration object");
        }
        const { storeKey: _storeKey, ...legacyValue } =
          encodedLegacyValue as Record<string, unknown>;
        const compatibleRegistration = makeAwaiting("compatible-registration");
        const compatibleCustomObject = yield* customObject(
          "compatible-custom-object",
          "2026-01-02T00:00:00.000Z",
          compatibleRegistration
        );

        get.mockImplementationOnce((request) => ({
          execute: vi.fn().mockResolvedValue({
            body: {
              results:
                request?.queryArgs?.where ===
                'value(storeKey is defined) and value(status = "awaiting_approval")'
                  ? [compatibleCustomObject]
                  : [
                      {
                        createdAt: legacyRegistration.createdAt.toISOString(),
                        id: "legacy-custom-object",
                        lastModifiedAt: "2026-01-03T00:00:00.000Z",
                        value: legacyValue,
                      },
                      compatibleCustomObject,
                    ],
            },
          }),
        }));
        const queries = yield* RegistrationQueries;

        const hasPendingEmail = yield* queries.hasPendingEmail(
          Redacted.make(Email.make("ada@example.com"), { label: "email" })
        );

        expect(hasPendingEmail).toBe(true);
        expect(get).toHaveBeenCalledWith({
          queryArgs: {
            limit: 101,
            offset: 0,
            sort: ["lastModifiedAt desc", "id desc"],
            where:
              'value(storeKey is defined) and value(status = "awaiting_approval")',
            withTotal: false,
          },
        });
      }).pipe(Effect.provide(layer))
  );

  itEffect(
    "uses provider ascending keyset pagination for last modified sort",
    () =>
      Effect.gen(function* () {
        execute.mockResolvedValueOnce({
          body: {
            results: [
              yield* customObject(
                "custom-object-1",
                "2026-01-01T00:00:00.000Z",
                makeAwaiting("registration-1")
              ),
              yield* customObject(
                "custom-object-2",
                "2026-01-02T00:00:00.000Z",
                makeAwaiting("registration-2")
              ),
            ],
          },
        });
        execute.mockResolvedValueOnce({
          body: {
            results: [
              yield* customObject(
                "custom-object-2",
                "2026-01-02T00:00:00.000Z",
                makeAwaiting("registration-2")
              ),
              yield* customObject(
                "custom-object-3",
                "2026-01-03T00:00:00.000Z",
                makeAwaiting("registration-3")
              ),
            ],
          },
        });
        const queries = yield* RegistrationQueries;

        const firstPage = yield* queries.list({
          limit: 1,
          sort: { field: "lastModifiedAt", direction: "asc" },
        });
        const cursor = firstPage.nextCursor;
        if (!cursor) {
          throw new Error("Expected a next cursor");
        }
        const secondPage = yield* queries.list({
          cursor,
          limit: 1,
          sort: { field: "lastModifiedAt", direction: "asc" },
        });

        expect(
          secondPage.items.map((item) => String(item.registration.id))
        ).toEqual(["registration-2"]);
        expect(get).toHaveBeenLastCalledWith({
          queryArgs: {
            limit: 2,
            offset: 0,
            sort: ["lastModifiedAt asc", "id asc"],
            where:
              'value(storeKey is defined) and (lastModifiedAt > "2026-01-01T00:00:00.000Z" or (lastModifiedAt = "2026-01-01T00:00:00.000Z" and id > "custom-object-1"))',
            withTotal: false,
          },
        });
      }).pipe(Effect.provide(layer))
  );

  itEffect("uses provider keyset pagination for created at sort", () =>
    Effect.gen(function* () {
      execute.mockResolvedValueOnce({
        body: {
          results: [
            yield* customObject(
              "custom-object-a",
              "2026-01-03T00:00:00.000Z",
              makeAwaiting("registration-a")
            ),
            yield* customObject(
              "custom-object-b",
              "2026-01-02T00:00:00.000Z",
              makeAwaiting("registration-b")
            ),
          ],
        },
      });
      execute.mockResolvedValueOnce({
        body: {
          results: [
            yield* customObject(
              "custom-object-b",
              "2026-01-01T00:00:00.000Z",
              makeAwaiting("registration-b")
            ),
            yield* customObject(
              "custom-object-c",
              "2026-01-04T00:00:00.000Z",
              makeAwaiting("registration-c")
            ),
          ],
        },
      });
      const queries = yield* RegistrationQueries;

      const firstPage = yield* queries.list({
        limit: 1,
        sort: { field: "createdAt", direction: "asc" },
      });
      const cursor = firstPage.nextCursor;
      if (!cursor) {
        throw new Error("Expected a next cursor");
      }
      const secondPage = yield* queries.list({
        cursor,
        limit: 1,
        sort: { field: "createdAt", direction: "asc" },
      });

      expect(
        secondPage.items.map((item) => String(item.registration.id))
      ).toEqual(["registration-b"]);
      expect(get).toHaveBeenLastCalledWith({
        queryArgs: {
          limit: 2,
          offset: 0,
          sort: ["createdAt asc", "id asc"],
          where:
            'value(storeKey is defined) and (createdAt > "2026-01-01T00:00:00.000Z" or (createdAt = "2026-01-01T00:00:00.000Z" and id > "custom-object-a"))',
          withTotal: false,
        },
      });
    }).pipe(Effect.provide(layer))
  );

  itEffect("maps invalid custom object payloads to query failures", () =>
    Effect.gen(function* () {
      execute.mockResolvedValueOnce({
        body: {
          results: [
            {
              createdAt: "2026-01-01T00:00:00.000Z",
              id: "custom-object-1",
              lastModifiedAt: "2026-01-01T00:00:00.000Z",
              value: "{",
            },
          ],
        },
      });
      const queries = yield* RegistrationQueries;

      const error = yield* queries.list({ limit: 1 }).pipe(Effect.flip);

      expect(error).toBeInstanceOf(RegistrationQueryFailure);
      expect(error.operation).toBe("list");
    }).pipe(Effect.provide(layer))
  );

  itEffect("fails malformed cursors before querying Commercetools", () =>
    Effect.gen(function* () {
      const queries = yield* RegistrationQueries;

      const error = yield* queries
        .list({ cursor: "not-a-registration-query-cursor" })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(RegistrationQueryInvalidCursor);
      expect(error.operation).toBe("list");
      expect(execute).not.toHaveBeenCalled();
    }).pipe(Effect.provide(layer))
  );
});
