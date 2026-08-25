import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import type { RedactedEmail } from "@repo/registration/domain/identity";
import {
  Registration as RegistrationSchema,
  RegistrationStatus,
} from "@repo/registration/domain/registration";
import type {
  Registration,
  RegistrationStatus as RegistrationStatusType,
} from "@repo/registration/domain/registration";
import {
  encodeRegistrationQueryCursor,
  normalizeRegistrationQuerySort,
  parseRegistrationQueryCursor,
  RegistrationQueries,
  RegistrationQueryFailure,
  registrationQueryCursorFromRecord,
} from "@repo/registration/services/registration-queries";
import type {
  ListRegistrationsInput,
  RegistrationQueryCursor,
  RegistrationQueryRecord,
  RegistrationQuerySortDirection,
  RegistrationQuerySortField,
} from "@repo/registration/services/registration-queries";
import { decodeJsonString } from "@repo/versioned-store";
import { Effect, Layer, Option, Redacted, Schema } from "effect";

import { commercetoolsClientsLayer } from "../client/layers";
import { CommercetoolsRestClient } from "../client/rest-client";
import {
  commercetoolsProviderFailureReason,
  commercetoolsFailureCause,
  commercetoolsRequest,
} from "../client/versioned-write";

interface CommercetoolsCustomObject {
  readonly id: string;
  readonly createdAt: string;
  readonly value: unknown;
  readonly lastModifiedAt: string;
}

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

const statusPredicate = (status: RegistrationStatusType) =>
  `value(status = "${escapePredicateString(status)}")`;

const compatibleRegistrationPredicate = "value(storeKey is defined)";

const wherePredicate = ({
  cursor,
  status,
}: {
  readonly cursor?: RegistrationQueryCursor | undefined;
  readonly status?: RegistrationStatusType | undefined;
}) => {
  const predicates: string[] = [compatibleRegistrationPredicate];

  if (status) {
    predicates.push(statusPredicate(status));
  }

  if (cursor) {
    predicates.push(`(${cursorPredicate(cursor)})`);
  }

  return predicates.length > 0 ? predicates.join(" and ") : undefined;
};

const sortExpressions = (
  field: RegistrationQuerySortField,
  direction: RegistrationQuerySortDirection
) => [`${field} ${direction}`, `id ${direction}`];

const normalizedEmail = (email: RedactedEmail) =>
  Redacted.value(email).trim().toLowerCase();

const registrationMatchesEmail = (
  registration: Registration,
  email: RedactedEmail
) =>
  Redacted.value(registration.details.email).trim().toLowerCase() ===
  normalizedEmail(email);

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

const RegistrationJson = Schema.toCodecJson(RegistrationSchema);
const UnknownStringRecord = Schema.Record(Schema.String, Schema.Unknown);

const decodeUnknownStringRecord = (value: unknown) =>
  Option.getOrUndefined(Schema.decodeUnknownOption(UnknownStringRecord)(value));

const tagFromStatus = (
  status: Registration["status"]
): Registration["_tag"] => {
  switch (status) {
    case "awaiting_approval": {
      return "AwaitingApprovalRegistration";
    }
    case "approval_processing": {
      return "ApprovalProcessingRegistration";
    }
    case "approved": {
      return "ApprovedRegistration";
    }
    case "rejected": {
      return "RejectedRegistration";
    }
    default: {
      return status satisfies never;
    }
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
  apiRoot,
  container,
  cursor,
  sort,
  status,
  limit,
}: {
  readonly apiRoot: ByProjectKeyRequestBuilder;
  readonly container: string;
  readonly cursor?: RegistrationQueryCursor | undefined;
  readonly sort: {
    readonly field: RegistrationQuerySortField;
    readonly direction: RegistrationQuerySortDirection;
  };
  readonly status?: RegistrationStatusType | undefined;
  readonly limit: number;
}) =>
  commercetoolsRequest(
    "Failed to query Commercetools registration Custom Objects",
    async () => {
      const where = wherePredicate({ cursor, status });
      const response = await apiRoot
        .customObjects()
        .withContainer({ container })
        .get({
          queryArgs: {
            limit,
            offset: 0,
            sort: sortExpressions(sort.field, sort.direction),
            withTotal: false,
            ...(where ? { where } : {}),
          },
        })
        .execute();

      return response.body;
    }
  ).pipe(
    Effect.mapError((error) => {
      const cause = commercetoolsFailureCause(error);

      return new RegistrationQueryFailure({
        cause,
        message: `Failed to list registrations: ${
          cause instanceof Error ? cause.message : String(cause)
        }`,
        operation: "list",
        reason: commercetoolsProviderFailureReason(cause),
      });
    })
  );

const decodeCustomObject = (customObject: CommercetoolsCustomObject) =>
  Effect.gen(function* () {
    const registration = yield* decodeRegistrationValue(
      customObject.value
    ).pipe(
      Effect.mapError(
        (cause) =>
          new RegistrationQueryFailure({
            cause,
            message: `Failed to list registrations: ${
              cause instanceof Error ? cause.message : String(cause)
            }`,
            operation: "list",
            reason: "invalidData",
          })
      )
    ) as Effect.Effect<Registration, RegistrationQueryFailure>;
    const createdAt = new Date(customObject.createdAt);
    const lastModifiedAt = new Date(customObject.lastModifiedAt);

    if (Number.isNaN(createdAt.getTime())) {
      return yield* new RegistrationQueryFailure({
        cause: new Error(
          `Invalid custom object createdAt ${customObject.createdAt}`
        ),
        message: `Failed to list registrations: Invalid custom object createdAt ${customObject.createdAt}`,
        operation: "list",
        reason: "invalidData",
      });
    }

    if (Number.isNaN(lastModifiedAt.getTime())) {
      return yield* new RegistrationQueryFailure({
        cause: new Error(
          `Invalid custom object lastModifiedAt ${customObject.lastModifiedAt}`
        ),
        message: `Failed to list registrations: Invalid custom object lastModifiedAt ${customObject.lastModifiedAt}`,
        operation: "list",
        reason: "invalidData",
      });
    }

    return {
      createdAt,
      id: customObject.id,
      lastModifiedAt,
      registration,
    } satisfies RegistrationQueryRecord;
  });

export interface RegistrationQueriesLayerOptions {
  readonly container: string;
}

const makeRegistrationQueries = ({
  apiRoot,
  container,
}: RegistrationQueriesLayerOptions & {
  readonly apiRoot: ByProjectKeyRequestBuilder;
}) => {
  const list = Effect.fn("CommercetoolsRegistrationQueries.list")(function* (
    input: ListRegistrationsInput
  ) {
    const limit = normalizeLimit(input.limit);
    const sort = normalizeRegistrationQuerySort(input.sort);
    const cursor = yield* parseRegistrationQueryCursor(input.cursor, sort);
    const search = normalizedSearch(input.search);

    if (!search) {
      const response = yield* queryCustomObjects({
        apiRoot,
        container,
        cursor,
        limit: clamp(limit + 1, MIN_LIST_LIMIT, MAX_PROVIDER_BATCH_SIZE),
        sort,
        status: input.status,
      });
      const records = yield* Effect.forEach(
        response.results,
        decodeCustomObject
      );
      const items = records.slice(0, limit);

      const last = items.at(-1);
      const nextCursor =
        records.length > limit && last
          ? encodeRegistrationQueryCursor(
              registrationQueryCursorFromRecord(last, sort)
            )
          : undefined;

      return nextCursor ? { items, nextCursor } : { items };
    }

    let providerCursor = cursor;
    const matched: RegistrationQueryRecord[] = [];
    let hasMoreProviderRecords = true;

    while (matched.length <= limit && hasMoreProviderRecords) {
      const response = yield* queryCustomObjects({
        apiRoot,
        container,
        cursor: providerCursor,
        limit: MAX_PROVIDER_BATCH_SIZE,
        sort,
        status: input.status,
      });
      const records = yield* Effect.forEach(
        response.results,
        decodeCustomObject
      );

      matched.push(
        ...records.filter((record) =>
          registrationMatchesSearch(record.registration, input.search)
        )
      );

      const lastProviderRecord = records.at(-1);
      providerCursor = lastProviderRecord
        ? registrationQueryCursorFromRecord(lastProviderRecord, sort)
        : undefined;
      hasMoreProviderRecords =
        records.length === MAX_PROVIDER_BATCH_SIZE &&
        providerCursor !== undefined;
    }

    const items = matched.slice(0, limit);

    const last = items.at(-1);
    const nextCursor =
      matched.length > limit && last
        ? encodeRegistrationQueryCursor(
            registrationQueryCursorFromRecord(last, sort)
          )
        : undefined;

    return nextCursor ? { items, nextCursor } : { items };
  });

  const hasPendingEmail = Effect.fn(
    "CommercetoolsRegistrationQueries.hasPendingEmail"
  )(function* (email: RedactedEmail) {
    for (const status of [
      "awaiting_approval",
      "approval_processing",
    ] as const) {
      let cursor: string | undefined;

      do {
        const result = yield* list({
          limit: MAX_LIST_LIMIT,
          status,
          ...(cursor === undefined ? {} : { cursor }),
        });

        if (
          result.items.some((item) =>
            registrationMatchesEmail(item.registration, email)
          )
        ) {
          return true;
        }

        cursor = result.nextCursor;
      } while (cursor !== undefined);
    }

    return false;
  });

  return RegistrationQueries.of({
    hasPendingEmail,
    list,
  });
};

const registrationQueriesImplementationLayer = (
  options: RegistrationQueriesLayerOptions
) =>
  Layer.effect(
    RegistrationQueries,
    Effect.gen(function* () {
      const { apiRoot } = yield* CommercetoolsRestClient;

      return makeRegistrationQueries({ apiRoot, ...options });
    })
  );

export const registrationQueriesLayerFrom = ({
  apiRoot,
  container,
}: RegistrationQueriesLayerOptions & {
  readonly apiRoot: ByProjectKeyRequestBuilder;
}) =>
  registrationQueriesImplementationLayer({ container }).pipe(
    Layer.provide(CommercetoolsRestClient.testLayer(apiRoot))
  );

export const registrationQueriesLayer = (
  options: RegistrationQueriesLayerOptions
) =>
  registrationQueriesImplementationLayer(options).pipe(
    Layer.provide(commercetoolsClientsLayer)
  );
