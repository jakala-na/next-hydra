import {
  CompanyMemberRemovalPersistenceFailure,
  CompanyMemberRemovalRecord,
  CompanyMemberRemovalRecords,
  companyMemberRemovalRecordKey,
} from "@repo/commerce/services/company-member-removal-records";
import type {
  BeginCompanyMemberRemovalInput,
  FindCompanyMemberRemovalInput,
} from "@repo/commerce/services/company-member-removal-records";
import { VersionedKeyValueStore } from "@repo/versioned-store";
import type { StoreError } from "@repo/versioned-store";
import { Effect, Layer, Option } from "effect";

const persistenceFailure = (
  operation: CompanyMemberRemovalPersistenceFailure["operation"],
  error: StoreError
) =>
  error.reason === "unavailable"
    ? Effect.fail(
        new CompanyMemberRemovalPersistenceFailure({
          cause: error.cause,
          message: `Company member removal receipt ${operation} is temporarily unavailable`,
          operation,
          reason: "unavailable",
        })
      )
    : Effect.die(error);

export const companyMemberRemovalRecordsLayerStorage = Layer.effect(
  CompanyMemberRemovalRecords,
  Effect.gen(function* () {
    const store = yield* VersionedKeyValueStore;

    const find = Effect.fn("CompanyMemberRemovalRecords.find")(
      (input: FindCompanyMemberRemovalInput) =>
        store
          .get(companyMemberRemovalRecordKey(input), CompanyMemberRemovalRecord)
          .pipe(
            Effect.map(Option.map(({ value }) => value)),
            Effect.catchTag("StoreError", (error) =>
              persistenceFailure("read", error)
            )
          )
    );

    const begin = Effect.fn("CompanyMemberRemovalRecords.begin")(
      function attempt(
        input: BeginCompanyMemberRemovalInput
      ): Effect.Effect<
        CompanyMemberRemovalRecord,
        CompanyMemberRemovalPersistenceFailure
      > {
        const key = companyMemberRemovalRecordKey(input);
        const next = new CompanyMemberRemovalRecord({
          ...input,
          status: "pending",
        });

        return store.get(key, CompanyMemberRemovalRecord).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () => store.insert(key, CompanyMemberRemovalRecord, next),
              onSome: (current) =>
                current.value.status === "pending" &&
                current.value.authUserId === input.authUserId
                  ? Effect.void
                  : store.update(
                      key,
                      CompanyMemberRemovalRecord,
                      current,
                      next
                    ),
            })
          ),
          Effect.as(next),
          Effect.catchTag("StoreConflict", () => attempt(input)),
          Effect.catchTag("StoreError", (error) =>
            persistenceFailure("begin", error)
          )
        );
      }
    );

    const complete = Effect.fn("CompanyMemberRemovalRecords.complete")(
      function attempt(
        record: CompanyMemberRemovalRecord
      ): Effect.Effect<void, CompanyMemberRemovalPersistenceFailure> {
        const key = companyMemberRemovalRecordKey(record);

        return store.get(key, CompanyMemberRemovalRecord).pipe(
          Effect.flatMap(
            Option.match({
              onNone: () =>
                Effect.die(
                  new Error(
                    `Company member removal receipt ${key} disappeared before completion`
                  )
                ),
              onSome: (current) =>
                current.value.status === "completed"
                  ? Effect.void
                  : store.update(
                      key,
                      CompanyMemberRemovalRecord,
                      current,
                      new CompanyMemberRemovalRecord({
                        ...current.value,
                        status: "completed",
                      })
                    ),
            })
          ),
          Effect.catchTag("StoreConflict", () => attempt(record)),
          Effect.catchTag("StoreError", (error) =>
            persistenceFailure("complete", error)
          )
        );
      }
    );

    return CompanyMemberRemovalRecords.of({ begin, complete, find });
  })
);
