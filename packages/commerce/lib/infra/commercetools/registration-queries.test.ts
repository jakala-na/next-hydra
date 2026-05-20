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
  Registration,
} from "@repo/registration-effect/domain/registration";
import {
  RegistrationQueries,
  RegistrationQueryFailure,
  RegistrationQueryInvalidCursor,
} from "@repo/registration-effect/services/registration-queries";
import { encodeJsonString } from "@repo/registration-effect/services/versioned-key-value-store";
import type { Schema } from "effect";
import { Effect, Redacted } from "effect";
import { beforeEach, vi } from "vitest";
import {
  encodeRegistrationStorageValue,
  layerCommercetoolsRegistrationQueries,
} from "./registration-queries";

const mocks = vi.hoisted(() => {
  const executeMock = vi.fn();
  const getMock = vi.fn(() => ({ execute: executeMock }));
  const withContainerMock = vi.fn(() => ({ get: getMock }));
  const customObjectsMock = vi.fn(() => ({
    withContainer: withContainerMock,
  }));

  return {
    customObjects: customObjectsMock,
    execute: executeMock,
    get: getMock,
    withContainer: withContainerMock,
  };
});

vi.mock("../../client/api-root", () => ({
  apiRoot: {
    customObjects: mocks.customObjects,
  },
}));

const { customObjects, execute, get, withContainer } = mocks;

const container = "b2b-registration-by-id";
const layer = layerCommercetoolsRegistrationQueries({
  batchSize: 2,
  container,
});

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

describe("layerCommercetoolsRegistrationQueries", () => {
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
        ).toEqual(["registration-3"]);
        expect(result.nextCursor).toBeDefined();
        expect(withContainer).toHaveBeenCalledWith({ container });
        expect(get).toHaveBeenCalledWith({
          queryArgs: {
            limit: 2,
            offset: 0,
            sort: ["lastModifiedAt desc", "id desc"],
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
            '(lastModifiedAt < "2026-01-03T00:00:00.000Z" or (lastModifiedAt = "2026-01-03T00:00:00.000Z" and id < "custom-object-3"))',
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
          where: 'value(status = "awaiting_approval")',
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
            'value(status = "awaiting_approval") and (lastModifiedAt < "2026-01-03T00:00:00.000Z" or (lastModifiedAt = "2026-01-03T00:00:00.000Z" and id < "custom-object-3"))',
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
      expect(JSON.stringify(customObjectValue)).not.toContain('"_tag"');

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
              '(lastModifiedAt > "2026-01-01T00:00:00.000Z" or (lastModifiedAt = "2026-01-01T00:00:00.000Z" and id > "custom-object-1"))',
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
            '(createdAt > "2026-01-01T00:00:00.000Z" or (createdAt = "2026-01-01T00:00:00.000Z" and id > "custom-object-a"))',
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
