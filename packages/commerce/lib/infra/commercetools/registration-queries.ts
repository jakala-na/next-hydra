import {
  type Registration,
  Registration as RegistrationSchema,
  RegistrationStatus,
  type RegistrationStatus as RegistrationStatusType,
} from "@repo/registration-effect/domain/registration";
import {
  encodeRegistrationQueryCursor,
  type ListRegistrationsInput,
  normalizeRegistrationQuerySort,
  parseRegistrationQueryCursor,
  RegistrationQueries,
  type RegistrationQueryCursor,
  RegistrationQueryFailure,
  type RegistrationQueryRecord,
  type RegistrationQuerySortDirection,
  type RegistrationQuerySortField,
  registrationQueryCursorFromRecord,
} from "@repo/registration-effect/services/registration-queries";
import { decodeJsonString } from "@repo/registration-effect/services/versioned-key-value-store";
import { Effect, Layer, Option, Schema } from "effect";
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

const RegistrationJson = Schema.toCodecJson(RegistrationSchema);
const UnknownStringRecord = Schema.Record(Schema.String, Schema.Unknown);

const decodeUnknownStringRecord = (value: unknown) =>
  Option.getOrUndefined(Schema.decodeUnknownOption(UnknownStringRecord)(value));

const tagFromStatus = (
  status: Registration["status"]
): Registration["_tag"] => {
  switch (status) {
    case "awaiting_approval":
      return "AwaitingApprovalRegistration";
    case "approved":
      return "ApprovedRegistration";
    case "rejected":
      return "RejectedRegistration";
    default:
      return status satisfies never;
  }
};

const withoutTopLevelTag = (value: unknown) => {
  const record = decodeUnknownStringRecord(value);

  if (!record) {
    return value;
  }

  const { _tag, ...rest } = record;

  return rest;
};

const withTopLevelTagFromStatus = (value: unknown) => {
  const record = decodeUnknownStringRecord(value);

  if (!record || record._tag !== undefined) {
    return value;
  }

  const status = Option.getOrUndefined(
    Schema.decodeUnknownOption(RegistrationStatus)(record.status)
  );

  if (!status) {
    return value;
  }

  return {
    _tag: tagFromStatus(status),
    ...record,
  };
};

export const encodeRegistrationStorageValue = (registration: Registration) =>
  Schema.encodeEffect(RegistrationJson)(registration).pipe(
    Effect.map(withoutTopLevelTag)
  );

const decodeRegistrationValue = (value: unknown) => {
  if (typeof value === "string") {
    return decodeJsonString(RegistrationSchema, value);
  }

  return Schema.decodeUnknownEffect(RegistrationJson)(
    withTopLevelTagFromStatus(value)
  );
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
    const registration = yield* decodeRegistrationValue(
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
): RegistrationStatusType => record.registration.status;

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
            cursor = registrationQueryCursorFromRecord(record, sort);

            if (input.status && statusFromRecord(record) !== input.status) {
              continue;
            }

            accepted.push(record);

            if (accepted.length > limit) {
              break;
            }
          }
        }

        const items = accepted.slice(0, limit);

        const last = items.at(-1);
        const nextCursor =
          accepted.length > limit && last
            ? encodeRegistrationQueryCursor(
                registrationQueryCursorFromRecord(last, sort)
              )
            : undefined;

        return nextCursor ? { items, nextCursor } : { items };
      }),
    })
  );
