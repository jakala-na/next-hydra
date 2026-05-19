import {
  type Registration,
  Registration as RegistrationSchema,
} from "@repo/registration-effect/domain/registration";
import {
  encodeRegistrationQueryCursor,
  type ListRegistrationsInput,
  normalizeRegistrationQuerySort,
  parseRegistrationQueryCursor,
  RegistrationListItem,
  RegistrationQueries,
  type RegistrationQueryCursor,
  RegistrationQueryFailure,
  type RegistrationQueryRecord,
  type RegistrationQuerySortDirection,
  type RegistrationQuerySortField,
  type RegistrationQueryStatus,
  registrationQueryCursorFromItem,
} from "@repo/registration-effect/services/registration-queries";
import { decodeJsonString } from "@repo/registration-effect/services/versioned-key-value-store";
import { Effect, Layer, Redacted } from "effect";
import { apiRoot } from "../../client/api-root";

interface CommercetoolsCustomObject {
  readonly id: string;
  readonly createdAt: string;
  readonly value: unknown;
  readonly lastModifiedAt: string;
}

interface CommercetoolsCustomObjectPagedQueryResponse {
  readonly results: readonly CommercetoolsCustomObject[];
}

const DEFAULT_PROVIDER_BATCH_SIZE = 100;
const MAX_PROVIDER_BATCH_SIZE = 500;
const DEFAULT_LIST_LIMIT = 20;
const MIN_LIST_LIMIT = 1;
const MAX_LIST_LIMIT = 100;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const normalizeLimit = (limit: number | undefined) => {
  if (limit === undefined) {
    return DEFAULT_LIST_LIMIT;
  }

  return clamp(Math.trunc(limit), MIN_LIST_LIMIT, MAX_LIST_LIMIT);
};

const escapePredicateString = (value: string) =>
  value.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

const cursorPredicate = (cursor: RegistrationQueryCursor) => {
  const id = escapePredicateString(cursor.id);
  const operator = cursor.sort.direction === "asc" ? ">" : "<";

  const sortValue = escapePredicateString(cursor.sort.value);
  const sortField = cursor.sort.field;

  return `${sortField} ${operator} "${sortValue}" or (${sortField} = "${sortValue}" and id ${operator} "${id}")`;
};

const sortExpressions = (
  field: RegistrationQuerySortField,
  direction: RegistrationQuerySortDirection
) => {
  return [`${field} ${direction}`, `id ${direction}`];
};

const queryCustomObjects = ({
  container,
  cursor,
  sort,
  limit,
}: {
  readonly container: string;
  readonly cursor?: RegistrationQueryCursor;
  readonly sort: {
    readonly field: RegistrationQuerySortField;
    readonly direction: RegistrationQuerySortDirection;
  };
  readonly limit: number;
}) =>
  Effect.tryPromise({
    try: async () => {
      const response = await apiRoot
        .customObjects()
        .withContainer({ container })
        .get({
          queryArgs: {
            limit,
            offset: 0,
            sort: sortExpressions(sort.field, sort.direction),
            withTotal: false,
            ...(cursor ? { where: cursorPredicate(cursor) } : {}),
          },
        })
        .execute();

      return response.body as CommercetoolsCustomObjectPagedQueryResponse;
    },
    catch: (cause) =>
      new RegistrationQueryFailure({
        operation: "list",
        cause,
      }),
  });

const decodeCustomObject = (customObject: CommercetoolsCustomObject) =>
  Effect.gen(function* () {
    if (typeof customObject.value !== "string") {
      return yield* new RegistrationQueryFailure({
        operation: "list",
        cause: new Error("Expected custom object value to be a JSON string"),
      });
    }

    const registration = yield* decodeJsonString(
      RegistrationSchema,
      customObject.value
    ).pipe(
      Effect.mapError(
        (cause) =>
          new RegistrationQueryFailure({
            operation: "list",
            cause,
          })
      )
    ) as Effect.Effect<Registration, RegistrationQueryFailure, never>;
    const createdAt = new Date(customObject.createdAt);
    const lastModifiedAt = new Date(customObject.lastModifiedAt);

    if (Number.isNaN(createdAt.getTime())) {
      return yield* new RegistrationQueryFailure({
        operation: "list",
        cause: new Error(
          `Invalid custom object createdAt ${customObject.createdAt}`
        ),
      });
    }

    if (Number.isNaN(lastModifiedAt.getTime())) {
      return yield* new RegistrationQueryFailure({
        operation: "list",
        cause: new Error(
          `Invalid custom object lastModifiedAt ${customObject.lastModifiedAt}`
        ),
      });
    }

    return {
      id: customObject.id,
      createdAt,
      registration,
      lastModifiedAt,
    } satisfies RegistrationQueryRecord;
  });

const statusFromRecord = (
  record: RegistrationQueryRecord
): RegistrationQueryStatus => {
  switch (record.registration._tag) {
    case "AwaitingApprovalRegistration":
      return "awaiting_approval";
    case "ApprovedRegistration":
      return "approved";
    case "RejectedRegistration":
      return "rejected";
    default:
      return record.registration satisfies never;
  }
};

const toListItem = (record: RegistrationQueryRecord) =>
  new RegistrationListItem({
    id: record.id,
    registrationId: String(record.registration.id),
    status: statusFromRecord(record),
    companyName: String(record.registration.details.companyName),
    contactFirstName: String(
      Redacted.value(record.registration.details.contactFirstName)
    ),
    contactLastName: String(
      Redacted.value(record.registration.details.contactLastName)
    ),
    email: String(Redacted.value(record.registration.details.email)),
    createdAt: record.createdAt,
    updatedAt: record.registration.updatedAt,
    lastModifiedAt: record.lastModifiedAt,
  });

export interface CommercetoolsRegistrationQueriesOptions {
  readonly container: string;
  readonly batchSize?: number;
}

export const layerCommercetoolsRegistrationQueries = ({
  container,
  batchSize = DEFAULT_PROVIDER_BATCH_SIZE,
}: CommercetoolsRegistrationQueriesOptions) =>
  Layer.succeed(
    RegistrationQueries,
    RegistrationQueries.of({
      list: Effect.fn("CommercetoolsRegistrationQueries.list")(function* (
        input: ListRegistrationsInput
      ) {
        const limit = normalizeLimit(input.limit);
        const sort = normalizeRegistrationQuerySort(input.sort);
        const providerLimit = clamp(
          batchSize,
          limit + 1,
          MAX_PROVIDER_BATCH_SIZE
        );

        const accepted: RegistrationQueryRecord[] = [];
        let cursor = yield* parseRegistrationQueryCursor(input.cursor, sort);
        let hasMoreProviderRecords = true;

        while (accepted.length <= limit && hasMoreProviderRecords) {
          const response = yield* queryCustomObjects({
            container,
            cursor,
            sort,
            limit: providerLimit,
          });
          hasMoreProviderRecords = response.results.length === providerLimit;

          if (response.results.length === 0) {
            break;
          }

          for (const customObject of response.results) {
            const record = yield* decodeCustomObject(customObject);
            cursor = registrationQueryCursorFromItem(toListItem(record), sort);

            if (input.status && statusFromRecord(record) !== input.status) {
              continue;
            }

            accepted.push(record);

            if (accepted.length > limit) {
              break;
            }
          }
        }

        const items = accepted
          .slice(0, limit)
          .map((record) => toListItem(record));

        const last = items.at(-1);
        const nextCursor =
          accepted.length > limit && last
            ? encodeRegistrationQueryCursor(
                registrationQueryCursorFromItem(last, sort)
              )
            : undefined;

        return nextCursor ? { items, nextCursor } : { items };
      }),
    })
  );
