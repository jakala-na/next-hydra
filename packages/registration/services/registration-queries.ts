import { StoreFailureReason } from "@repo/versioned-store";
import { Context, Effect, Layer, Option, Redacted, Schema } from "effect";

import type { RedactedEmail } from "../domain/identity";
import type { Registration, RegistrationStatus } from "../domain/registration";

export const RegistrationQuerySortField = Schema.Literals([
  "lastModifiedAt",
  "createdAt",
]);
export type RegistrationQuerySortField = typeof RegistrationQuerySortField.Type;

export const RegistrationQuerySortDirection = Schema.Literals(["asc", "desc"]);
export type RegistrationQuerySortDirection =
  typeof RegistrationQuerySortDirection.Type;

export interface RegistrationQuerySort {
  readonly field: RegistrationQuerySortField;
  readonly direction?: RegistrationQuerySortDirection;
}

export interface ListRegistrationsInput {
  readonly status?: RegistrationStatus;
  readonly search?: string;
  readonly sort?: RegistrationQuerySort;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ListRegistrationsResult {
  readonly items: readonly RegistrationQueryRecord[];
  readonly nextCursor?: string;
}

export class RegistrationQueryFailure extends Schema.TaggedError<RegistrationQueryFailure>()(
  "RegistrationQueryFailure",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.Literal("list"),
    reason: StoreFailureReason,
  }
) {}

export class RegistrationQueryInvalidCursor extends Schema.TaggedError<RegistrationQueryInvalidCursor>()(
  "RegistrationQueryInvalidCursor",
  {
    cursor: Schema.String,
    message: Schema.String,
    operation: Schema.Literal("list"),
  }
) {}

export type RegistrationQueryError =
  | RegistrationQueryFailure
  | RegistrationQueryInvalidCursor;

export const RegistrationQueryCursorSchema = Schema.Struct({
  id: Schema.String,
  sort: Schema.Struct({
    direction: RegistrationQuerySortDirection,
    field: RegistrationQuerySortField,
    value: Schema.String,
  }),
});
export type RegistrationQueryCursor = typeof RegistrationQueryCursorSchema.Type;

const DEFAULT_LIST_LIMIT = 20;
const MIN_LIST_LIMIT = 1;
const MAX_LIST_LIMIT = 100;
const DEFAULT_SORT = {
  direction: "desc",
  field: "lastModifiedAt",
} as const satisfies Required<RegistrationQuerySort>;

export interface RegistrationQueryRecord {
  readonly id: string;
  readonly registration: Registration;
  readonly createdAt: Date;
  readonly lastModifiedAt: Date;
}

const pendingRegistrationStatuses = [
  "awaiting_approval",
  "approval_processing",
] as const satisfies readonly RegistrationStatus[];

const normalizedEmail = (email: RedactedEmail | string) =>
  (typeof email === "string" ? email : Redacted.value(email))
    .trim()
    .toLowerCase();

const normalizedSearch = (search: string | undefined) => {
  const trimmed = search?.trim().toLowerCase();
  return trimmed && trimmed.length > 0 ? trimmed : undefined;
};

const registrationMatchesSearch = (
  registration: Registration,
  search: string | undefined
) => {
  const normalized = normalizedSearch(search);

  if (!normalized) {
    return true;
  }

  const { details } = registration;

  return [
    String(details.companyName),
    Redacted.value(details.contactFirstName),
    Redacted.value(details.contactLastName),
    Redacted.value(details.email),
    details.vatId ? Redacted.value(details.vatId) : "",
  ].some((value) => value.toLowerCase().includes(normalized));
};

const isPendingRegistrationWithEmail = (
  registration: Registration,
  email: RedactedEmail
) =>
  pendingRegistrationStatuses.some(
    (status) => status === registration.status
  ) && normalizedEmail(registration.details.email) === normalizedEmail(email);

const normalizeLimit = (limit: number | undefined) => {
  if (limit === undefined) {
    return DEFAULT_LIST_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), MIN_LIST_LIMIT), MAX_LIST_LIMIT);
};

export const normalizeRegistrationQuerySort = (
  sort: RegistrationQuerySort | undefined
): Required<RegistrationQuerySort> => ({
  direction: sort?.direction ?? DEFAULT_SORT.direction,
  field: sort?.field ?? DEFAULT_SORT.field,
});

const sortValueForRecord = (
  record: RegistrationQueryRecord,
  sort: Required<RegistrationQuerySort>
) => {
  switch (sort.field) {
    case "lastModifiedAt": {
      return record.lastModifiedAt.toISOString();
    }
    case "createdAt": {
      return record.createdAt.toISOString();
    }
    default: {
      return sort.field satisfies never;
    }
  }
};

const compareSortValues = (
  left: string,
  right: string,
  direction: RegistrationQuerySortDirection
) => {
  const compared = left.localeCompare(right);

  if (compared === 0) {
    return 0;
  }

  return direction === "asc" ? compared : -compared;
};

const compareRegistrationQueryRecords =
  (sort: Required<RegistrationQuerySort>) =>
  (left: RegistrationQueryRecord, right: RegistrationQueryRecord) => {
    const bySortValue = compareSortValues(
      sortValueForRecord(left, sort),
      sortValueForRecord(right, sort),
      sort.direction
    );

    if (bySortValue !== 0) {
      return bySortValue;
    }

    return compareSortValues(left.id, right.id, sort.direction);
  };

export const registrationQueryCursorFromRecord = (
  record: RegistrationQueryRecord,
  sort: Required<RegistrationQuerySort>
): RegistrationQueryCursor => ({
  id: record.id,
  sort: {
    direction: sort.direction,
    field: sort.field,
    value: sortValueForRecord(record, sort),
  },
});

const cursorMatchesSort = (
  cursor: RegistrationQueryCursor,
  sort: Required<RegistrationQuerySort>
) =>
  cursor.sort.field === sort.field && cursor.sort.direction === sort.direction;

const isAfterCursor = (
  record: RegistrationQueryRecord,
  cursor: RegistrationQueryCursor
) => {
  const sort: Required<RegistrationQuerySort> = {
    direction: cursor.sort.direction,
    field: cursor.sort.field,
  };
  const recordCursor = registrationQueryCursorFromRecord(record, sort);
  const bySortValue = compareSortValues(
    recordCursor.sort.value,
    cursor.sort.value,
    sort.direction
  );

  if (bySortValue !== 0) {
    return bySortValue > 0;
  }

  return compareSortValues(record.id, cursor.id, sort.direction) > 0;
};

export const encodeRegistrationQueryCursor = ({
  id,
  sort,
}: RegistrationQueryCursor) =>
  Buffer.from(
    JSON.stringify({
      id,
      sort,
    })
  ).toString("base64url");

export const decodeRegistrationQueryCursor = (
  cursor: string
): RegistrationQueryCursor | undefined => {
  try {
    const decoded = Option.getOrUndefined(
      Schema.decodeUnknownOption(RegistrationQueryCursorSchema)(
        JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"))
      )
    );

    if (!decoded) {
      return undefined;
    }

    if (
      (decoded.sort.field === "lastModifiedAt" ||
        decoded.sort.field === "createdAt") &&
      Number.isNaN(new Date(decoded.sort.value).getTime())
    ) {
      return undefined;
    }

    return decoded;
  } catch {
    return undefined;
  }
};

export const parseRegistrationQueryCursor = (
  cursor: string | undefined,
  sort: Required<RegistrationQuerySort>
): Effect.Effect<
  RegistrationQueryCursor | undefined,
  RegistrationQueryInvalidCursor
> => {
  if (!cursor) {
    return Effect.sync(() => undefined);
  }

  const decoded = decodeRegistrationQueryCursor(cursor);

  if (!decoded) {
    return Effect.fail(
      new RegistrationQueryInvalidCursor({
        cursor,
        message: `Invalid registration query cursor for list: ${cursor}`,
        operation: "list",
      })
    );
  }

  if (!cursorMatchesSort(decoded, sort)) {
    return Effect.fail(
      new RegistrationQueryInvalidCursor({
        cursor,
        message: `Invalid registration query cursor for list: ${cursor}`,
        operation: "list",
      })
    );
  }

  return Effect.succeed(decoded);
};

export const listRegistrationRecords = (
  records: Iterable<RegistrationQueryRecord>,
  input: ListRegistrationsInput
): Effect.Effect<ListRegistrationsResult, RegistrationQueryError> =>
  Effect.gen(function* () {
    const limit = normalizeLimit(input.limit);
    const sort = normalizeRegistrationQuerySort(input.sort);
    const cursor = yield* parseRegistrationQueryCursor(input.cursor, sort);
    return yield* Effect.try({
      catch: (cause) =>
        new RegistrationQueryFailure({
          cause,
          message: `Failed to list registrations: ${
            cause instanceof Error ? cause.message : String(cause)
          }`,
          operation: "list",
          reason: "unexpectedResponse",
        }),
      try: () => {
        const sorted = [...records].sort(compareRegistrationQueryRecords(sort));
        const filtered = sorted
          .filter((record) =>
            input.status ? record.registration.status === input.status : true
          )
          .filter((record) =>
            registrationMatchesSearch(record.registration, input.search)
          )
          .filter((record) => (cursor ? isAfterCursor(record, cursor) : true));
        const items = filtered.slice(0, limit);
        let nextCursor: string | undefined;

        if (filtered.length > limit) {
          const last = items.at(-1);

          if (last) {
            nextCursor = encodeRegistrationQueryCursor(
              registrationQueryCursorFromRecord(last, sort)
            );
          }
        }

        return nextCursor ? { items, nextCursor } : { items };
      },
    });
  });

export class RegistrationQueries extends Context.Service<
  RegistrationQueries,
  {
    readonly list: (
      input: ListRegistrationsInput
    ) => Effect.Effect<ListRegistrationsResult, RegistrationQueryError>;
    readonly hasPendingEmail: (
      email: RedactedEmail
    ) => Effect.Effect<boolean, RegistrationQueryError>;
  }
>()("@repo/registration/RegistrationQueries") {
  static readonly layerMemoryFrom = (
    records: Iterable<RegistrationQueryRecord>
  ) =>
    Layer.succeed(
      RegistrationQueries,
      RegistrationQueries.of({
        hasPendingEmail: Effect.fn("RegistrationQueries.hasPendingEmail")(
          (email) =>
            Effect.try({
              catch: (cause) =>
                new RegistrationQueryFailure({
                  cause,
                  message: `Failed to list registrations: ${
                    cause instanceof Error ? cause.message : String(cause)
                  }`,
                  operation: "list",
                  reason: "unexpectedResponse",
                }),
              try: () =>
                [...records].some((record) =>
                  isPendingRegistrationWithEmail(record.registration, email)
                ),
            })
        ),
        list: Effect.fn("RegistrationQueries.list")((input) =>
          listRegistrationRecords(records, input)
        ),
      })
    );
}
