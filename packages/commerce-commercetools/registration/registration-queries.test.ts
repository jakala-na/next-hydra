import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { describe, expect, it } from "@effect/vitest";
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
import { Effect, Redacted, Schema } from "effect";
import { beforeEach, vi } from "vitest";

import {
  encodeRegistrationStorageValue,
  registrationQueriesLayerFrom,
} from "./registration-queries";

interface CustomObjectsGetRequest {
  readonly queryArgs?: { readonly where?: string };
}

interface CustomObjectPayload {
  readonly createdAt: string;
  readonly id: string;
  readonly lastModifiedAt: string;
  readonly value: string;
}

interface CustomObjectResult {
  readonly createdAt: string;
  readonly id: string;
  readonly lastModifiedAt: string;
  readonly value: unknown;
}

interface CustomObjectsResponse {
  readonly body: { readonly results: readonly CustomObjectResult[] };
}

interface EncodedRegistrationValue {
  readonly status: string;
  readonly storeKey?: string;
}

interface CustomObjectsGetBuilder {
  readonly execute: () => Promise<CustomObjectsResponse>;
}

const execute = vi.fn<() => Promise<CustomObjectsResponse>>();
const get = vi.fn<
  (request?: CustomObjectsGetRequest) => CustomObjectsGetBuilder
>(() => ({ execute }));
const withContainer = vi.fn<() => { readonly get: typeof get }>(() => ({
  get,
}));
const customObjects = vi.fn<
  () => { readonly withContainer: typeof withContainer }
>(() => ({ withContainer }));
// SAFETY: Test double only implements customObjects used by this suite.
// oxlint-disable-next-line typescript/no-unsafe-type-assertion, anti-slop/no-chained-type-assertions -- CT SDK request builder is not constructible in unit tests.
const apiRoot = { customObjects } as unknown as ByProjectKeyRequestBuilder;

const container = "b2b-registration-by-id";
const layer = registrationQueriesLayerFrom({ apiRoot, container });

const makeDetails = (companyName: string) =>
  new CompanyRegistrationDetails({
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
    email: Redacted.make(Email.make("ada@example.com"), { label: "email" }),
  });

const makeAwaiting = (id: string, companyName = "Hydra Supplies") =>
  new AwaitingApprovalRegistration({
    _tag: "AwaitingApprovalRegistration",
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    details: makeDetails(companyName),
    id: RegistrationId.make(id),
    status: "awaiting_approval",
    storeKey: StoreKey.make("default-store"),
    updatedAt: new Date("2026-01-01T00:00:00.000Z"),
  });

const RegistrationJsonString = Schema.fromJsonString(
  Schema.toCodecJson(Registration)
);

const customObject = (
  id: string,
  lastModifiedAt: string,
  registration: Registration
): Effect.Effect<CustomObjectPayload, Schema.SchemaError> =>
  Effect.gen(function* () {
    return {
      createdAt: registration.createdAt.toISOString(),
      id,
      lastModifiedAt,
      value: yield* Schema.encodeEffect(RegistrationJsonString)(registration),
    };
  });

describe("registrationQueriesLayer", () => {
  beforeEach(() => {
    customObjects.mockClear();
    withContainer.mockClear();
    get.mockClear();
    execute.mockReset();
  });

  it.effect(
    "queries custom objects by lastModifiedAt and id cursor order",
    () =>
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

        expect(
          result.items.map((item) => String(item.registration.id))
        ).toStrictEqual(["registration-3"]);
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

  it.effect("uses the opaque cursor as a Commercetools seek predicate", () =>
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
      if (cursor === undefined) {
        throw new Error("Expected a next cursor");
      }
      const secondPage = yield* queries.list({
        cursor,
        limit: 1,
      });

      expect(
        secondPage.items.map((item) => String(item.registration.id))
      ).toStrictEqual(["registration-2"]);
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

  it.effect("pushes status filtering into the provider predicate", () =>
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

      expect(execute).toHaveBeenCalledOnce();
      expect(
        result.items.map((item) => String(item.registration.id))
      ).toStrictEqual(["registration-2"]);
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

  it.effect("combines status and cursor predicates in one provider query", () =>
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
      if (cursor === undefined) {
        throw new Error("Expected a next cursor");
      }
      const secondPage = yield* queries.list({
        cursor,
        limit: 1,
        status: "awaiting_approval",
      });

      expect(
        secondPage.items.map((item) => String(item.registration.id))
      ).toStrictEqual(["registration-2"]);
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

  it.effect("decodes storage status values without persisting _tag", () =>
    Effect.gen(function* () {
      const registration = makeAwaiting("registration-1");
      const customObjectValue =
        yield* encodeRegistrationStorageValue(registration);

      expect(customObjectValue).toMatchObject({
        status: "awaiting_approval",
      });
      expect(customObjectValue).not.toHaveProperty("_tag");

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

      expect(
        result.items.map((item) => String(item.registration.id))
      ).toStrictEqual(["registration-1"]);
    }).pipe(Effect.provide(layer))
  );

  it.effect(
    "eligibility lookup excludes registrations without a Store Key",
    () =>
      Effect.gen(function* () {
        const legacyRegistration = makeAwaiting("legacy-registration");
        const encodedLegacyValue =
          yield* encodeRegistrationStorageValue(legacyRegistration);

        // SAFETY: encodeRegistrationStorageValue returns the encoded Registration object, whose storeKey this fixture drops.
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- The encoder declares `unknown`, so the suite names the one field it strips.
        const encoded = encodedLegacyValue as EncodedRegistrationValue;
        const { storeKey: _storeKey, ...legacyValue } = encoded;
        const compatibleRegistration = makeAwaiting("compatible-registration");
        const compatibleCustomObject = yield* customObject(
          "compatible-custom-object",
          "2026-01-02T00:00:00.000Z",
          compatibleRegistration
        );

        get.mockImplementationOnce((request) => ({
          execute: vi
            .fn<() => Promise<CustomObjectsResponse>>()
            .mockResolvedValue({
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

        expect(hasPendingEmail).toBeTruthy();
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

  it.effect(
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
          sort: { direction: "asc", field: "lastModifiedAt" },
        });
        const cursor = firstPage.nextCursor;
        if (cursor === undefined) {
          throw new Error("Expected a next cursor");
        }
        const secondPage = yield* queries.list({
          cursor,
          limit: 1,
          sort: { direction: "asc", field: "lastModifiedAt" },
        });

        expect(
          secondPage.items.map((item) => String(item.registration.id))
        ).toStrictEqual(["registration-2"]);
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

  it.effect("uses provider keyset pagination for created at sort", () =>
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
        sort: { direction: "asc", field: "createdAt" },
      });
      const cursor = firstPage.nextCursor;
      if (cursor === undefined) {
        throw new Error("Expected a next cursor");
      }
      const secondPage = yield* queries.list({
        cursor,
        limit: 1,
        sort: { direction: "asc", field: "createdAt" },
      });

      expect(
        secondPage.items.map((item) => String(item.registration.id))
      ).toStrictEqual(["registration-b"]);
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

  it.effect("maps invalid custom object payloads to query failures", () =>
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

  it.effect("fails malformed cursors before querying Commercetools", () =>
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
