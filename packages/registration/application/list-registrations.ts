import { Result } from "better-result";
import type { RegistrationResult } from "../domain/errors";
import type { RegistrationStorePort } from "../domain/ports";
import type {
  ListRegistrationsInput,
  ListRegistrationsResult,
  RegistrationRecord,
} from "../domain/types";
import { toRegistrationDetail } from "../domain/types";

type CreateListRegistrationsOptions = {
  registrations: RegistrationStorePort;
};

const DEFAULT_LIST_LIMIT = 20;
const MAX_CURSOR_WINDOW = 100;

const matchesSearch = (record: RegistrationRecord, search: string) => {
  const query = search.toLowerCase();

  if (query.length === 0) {
    return true;
  }

  const haystack = [
    record.companyName,
    record.contactFirstName,
    record.contactLastName,
    record.email,
  ]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());

  return haystack.some((value) => value.includes(query));
};

const encodeCursor = (record: RegistrationRecord) =>
  Buffer.from(
    JSON.stringify({
      registrationId: record.registrationId,
      updatedAt: record.updatedAt,
    })
  ).toString("base64url");

const decodeCursor = (cursor: string) => {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    );

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof decoded.registrationId !== "string" ||
      typeof decoded.updatedAt !== "string"
    ) {
      return null;
    }

    return decoded as {
      registrationId: string;
      updatedAt: string;
    };
  } catch {
    return null;
  }
};

export function createListRegistrations(
  options: CreateListRegistrationsOptions
) {
  return async function listRegistrations(
    input: ListRegistrationsInput
  ): Promise<RegistrationResult<ListRegistrationsResult>> {
    const recordsResult =
      await options.registrations.listRegistrationRecords(MAX_CURSOR_WINDOW);

    if (recordsResult.isErr()) {
      return Result.err(recordsResult.error);
    }

    const limit = input.limit ?? DEFAULT_LIST_LIMIT;
    const cursor = input.cursor ? decodeCursor(input.cursor) : null;

    const filtered = recordsResult.value
      .filter((record) =>
        input.status ? record.status === input.status : true
      )
      .filter((record) =>
        input.search ? matchesSearch(record, input.search) : true
      )
      .filter((record) => {
        if (!cursor) {
          return true;
        }

        if (record.updatedAt < cursor.updatedAt) {
          return true;
        }

        if (record.updatedAt > cursor.updatedAt) {
          return false;
        }

        return record.registrationId < cursor.registrationId;
      });

    const items = filtered.slice(0, limit).map(toRegistrationDetail);
    const next = filtered[limit];

    return Result.ok({
      items,
      nextCursor: next ? encodeCursor(next) : undefined,
    });
  };
}
