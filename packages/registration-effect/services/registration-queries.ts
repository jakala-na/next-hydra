import { Context, Effect, Layer, Redacted, Schema } from "effect";
import type { Registration } from "../domain/registration";

export const RegistrationQueryStatus = Schema.Literals([
  "awaiting_approval",
  "approved",
  "rejected",
]);
export type RegistrationQueryStatus = typeof RegistrationQueryStatus.Type;

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

export class RegistrationListItem extends Schema.Class<RegistrationListItem>(
  "RegistrationListItem"
)({
  id: Schema.String,
  registrationId: Schema.String,
  status: RegistrationQueryStatus,
  companyName: Schema.String,
  contactFirstName: Schema.String,
  contactLastName: Schema.String,
  email: Schema.String,
  createdAt: Schema.Date,
  updatedAt: Schema.Date,
  lastModifiedAt: Schema.Date,
}) {}

export interface ListRegistrationsInput {
  readonly status?: RegistrationQueryStatus;
  readonly sort?: RegistrationQuerySort;
  readonly cursor?: string;
  readonly limit?: number;
}

export interface ListRegistrationsResult {
  readonly items: readonly RegistrationListItem[];
  readonly nextCursor?: string;
}

export class RegistrationQueryFailure extends Schema.TaggedErrorClass<RegistrationQueryFailure>()(
  "RegistrationQueryFailure",
  {
    operation: Schema.Literal("list"),
    cause: Schema.Defect,
  }
) {}

export class RegistrationQueryInvalidCursor extends Schema.TaggedErrorClass<RegistrationQueryInvalidCursor>()(
  "RegistrationQueryInvalidCursor",
  {
    operation: Schema.Literal("list"),
    cursor: Schema.String,
  }
) {}

export type RegistrationQueryError =
  | RegistrationQueryFailure
  | RegistrationQueryInvalidCursor;

export interface RegistrationQueryCursor {
  readonly id: string;
  readonly sort: {
    readonly field: RegistrationQuerySortField;
    readonly direction: RegistrationQuerySortDirection;
    readonly value: string;
  };
}

const DEFAULT_LIST_LIMIT = 20;
const MIN_LIST_LIMIT = 1;
const MAX_LIST_LIMIT = 100;
const DEFAULT_SORT = {
  field: "lastModifiedAt",
  direction: "desc",
} as const satisfies Required<RegistrationQuerySort>;

export interface RegistrationQueryRecord {
  readonly id: string;
  readonly registration: Registration;
  readonly createdAt: Date;
  readonly lastModifiedAt: Date;
}

const statusFromRegistration = (
  registration: Registration
): RegistrationQueryStatus => {
  switch (registration._tag) {
    case "AwaitingApprovalRegistration":
      return "awaiting_approval";
    case "ApprovedRegistration":
      return "approved";
    case "RejectedRegistration":
      return "rejected";
    default:
      return registration satisfies never;
  }
};

const toListItem = (record: RegistrationQueryRecord) =>
  new RegistrationListItem({
    id: record.id,
    registrationId: String(record.registration.id),
    status: statusFromRegistration(record.registration),
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

const normalizeLimit = (limit: number | undefined) => {
  if (limit === undefined) {
    return DEFAULT_LIST_LIMIT;
  }

  return Math.min(Math.max(Math.trunc(limit), MIN_LIST_LIMIT), MAX_LIST_LIMIT);
};

export const normalizeRegistrationQuerySort = (
  sort: RegistrationQuerySort | undefined
): Required<RegistrationQuerySort> => ({
  field: sort?.field ?? DEFAULT_SORT.field,
  direction: sort?.direction ?? DEFAULT_SORT.direction,
});

const sortValueForItem = (
  item: RegistrationListItem,
  sort: Required<RegistrationQuerySort>
) => {
  switch (sort.field) {
    case "lastModifiedAt":
      return item.lastModifiedAt.toISOString();
    case "createdAt":
      return item.createdAt.toISOString();
    default:
      return sort.field satisfies never;
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

const compareListItems =
  (sort: Required<RegistrationQuerySort>) =>
  (
    left: Pick<RegistrationListItem, "id" | "lastModifiedAt">,
    right: Pick<RegistrationListItem, "id" | "lastModifiedAt">
  ) => {
    const bySortValue = compareSortValues(
      sortValueForItem(left as RegistrationListItem, sort),
      sortValueForItem(right as RegistrationListItem, sort),
      sort.direction
    );

    if (bySortValue !== 0) {
      return bySortValue;
    }

    return compareSortValues(left.id, right.id, sort.direction);
  };

export const registrationQueryCursorFromItem = (
  item: Pick<RegistrationListItem, "id" | "lastModifiedAt">,
  sort: Required<RegistrationQuerySort>
): RegistrationQueryCursor => ({
  id: item.id,
  sort: {
    field: sort.field,
    direction: sort.direction,
    value: sortValueForItem(item as RegistrationListItem, sort),
  },
});

const cursorMatchesSort = (
  cursor: RegistrationQueryCursor,
  sort: Required<RegistrationQuerySort>
) =>
  cursor.sort.field === sort.field && cursor.sort.direction === sort.direction;

const isAfterCursor = (
  item: RegistrationListItem,
  cursor: RegistrationQueryCursor
) => {
  const sort: Required<RegistrationQuerySort> = {
    field: cursor.sort.field,
    direction: cursor.sort.direction,
  };
  const itemCursor = registrationQueryCursorFromItem(item, sort);
  const bySortValue = compareSortValues(
    itemCursor.sort.value,
    cursor.sort.value,
    sort.direction
  );

  if (bySortValue !== 0) {
    return bySortValue > 0;
  }

  return compareSortValues(item.id, cursor.id, sort.direction) > 0;
};

const isRegistrationQuerySortField = (
  value: unknown
): value is RegistrationQuerySortField =>
  value === "lastModifiedAt" || value === "createdAt";

const isRegistrationQuerySortDirection = (
  value: unknown
): value is RegistrationQuerySortDirection =>
  value === "asc" || value === "desc";

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
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    ) as unknown;

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      !("id" in decoded) ||
      !("sort" in decoded) ||
      typeof decoded.id !== "string" ||
      typeof decoded.sort !== "object" ||
      decoded.sort === null ||
      !("field" in decoded.sort) ||
      !("direction" in decoded.sort) ||
      !("value" in decoded.sort) ||
      !isRegistrationQuerySortField(decoded.sort.field) ||
      !isRegistrationQuerySortDirection(decoded.sort.direction) ||
      typeof decoded.sort.value !== "string"
    ) {
      return undefined;
    }

    if (
      (decoded.sort.field === "lastModifiedAt" ||
        decoded.sort.field === "createdAt") &&
      Number.isNaN(new Date(decoded.sort.value).getTime())
    ) {
      return undefined;
    }

    return {
      id: decoded.id,
      sort: {
        field: decoded.sort.field,
        direction: decoded.sort.direction,
        value: decoded.sort.value,
      },
    };
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
        operation: "list",
        cursor,
      })
    );
  }

  if (!cursorMatchesSort(decoded, sort)) {
    return Effect.fail(
      new RegistrationQueryInvalidCursor({
        operation: "list",
        cursor,
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
      try: () => {
        const sorted = Array.from(records, toListItem).sort(
          compareListItems(sort)
        );
        const filtered = sorted
          .filter((item) =>
            input.status ? item.status === input.status : true
          )
          .filter((item) => (cursor ? isAfterCursor(item, cursor) : true));
        const items = filtered.slice(0, limit);
        let nextCursor: string | undefined;

        if (filtered.length > limit) {
          const last = items.at(-1);

          if (last) {
            nextCursor = encodeRegistrationQueryCursor(
              registrationQueryCursorFromItem(last, sort)
            );
          }
        }

        return nextCursor ? { items, nextCursor } : { items };
      },
      catch: (cause) =>
        new RegistrationQueryFailure({
          operation: "list",
          cause,
        }),
    });
  });

export class RegistrationQueries extends Context.Service<
  RegistrationQueries,
  {
    readonly list: (
      input: ListRegistrationsInput
    ) => Effect.Effect<ListRegistrationsResult, RegistrationQueryError>;
  }
>()("@repo/registration-effect/RegistrationQueries") {
  static readonly layerMemoryFrom = (
    records: Iterable<RegistrationQueryRecord>
  ) =>
    Layer.succeed(
      RegistrationQueries,
      RegistrationQueries.of({
        list: Effect.fn("RegistrationQueries.list")((input) =>
          listRegistrationRecords(records, input)
        ),
      })
    );
}
