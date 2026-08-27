/* oxlint-disable max-classes-per-file, unicorn/throw-new-error -- The durable removal receipt and its persistence failure form one focused capability. */
import {
  Context,
  Effect,
  Layer,
  Option,
  Schema,
  SynchronizedRef,
} from "effect";

import {
  CommerceBusinessUnitId,
  CommerceCustomerId,
} from "../domain/commerce-account";
import { AuthUserId } from "../domain/commerce-request-context";

export class CompanyMemberRemovalRecord extends Schema.Class<CompanyMemberRemovalRecord>(
  "CompanyMemberRemovalRecord"
)({
  authUserId: AuthUserId,
  businessUnitId: CommerceBusinessUnitId,
  customerId: CommerceCustomerId,
  status: Schema.Literals(["pending", "completed"]),
}) {}

export class CompanyMemberRemovalPersistenceFailure extends Schema.TaggedError<CompanyMemberRemovalPersistenceFailure>()(
  "CompanyMemberRemovalPersistenceFailure",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.Literals(["begin", "complete", "read"]),
    reason: Schema.Literal("unavailable"),
  }
) {}

export interface BeginCompanyMemberRemovalInput {
  readonly authUserId: AuthUserId;
  readonly businessUnitId: CommerceBusinessUnitId;
  readonly customerId: CommerceCustomerId;
}

export interface FindCompanyMemberRemovalInput {
  readonly businessUnitId: CommerceBusinessUnitId;
  readonly customerId: CommerceCustomerId;
}

export const companyMemberRemovalRecordKey = (
  input: FindCompanyMemberRemovalInput
) =>
  `${String(input.businessUnitId).length}:${input.businessUnitId}${input.customerId}`;

export class CompanyMemberRemovalRecords extends Context.Service<
  CompanyMemberRemovalRecords,
  {
    readonly begin: (
      input: BeginCompanyMemberRemovalInput
    ) => Effect.Effect<
      CompanyMemberRemovalRecord,
      CompanyMemberRemovalPersistenceFailure
    >;
    readonly complete: (
      record: CompanyMemberRemovalRecord
    ) => Effect.Effect<void, CompanyMemberRemovalPersistenceFailure>;
    readonly find: (
      input: FindCompanyMemberRemovalInput
    ) => Effect.Effect<
      Option.Option<CompanyMemberRemovalRecord>,
      CompanyMemberRemovalPersistenceFailure
    >;
  }
>()("@repo/commerce/CompanyMemberRemovalRecords") {
  static readonly layerMemory = Layer.effect(
    CompanyMemberRemovalRecords,
    Effect.gen(function* () {
      const state = yield* SynchronizedRef.make(
        new Map<string, CompanyMemberRemovalRecord>()
      );

      return CompanyMemberRemovalRecords.of({
        begin: (input) =>
          SynchronizedRef.modify(state, (current) => {
            const record = new CompanyMemberRemovalRecord({
              ...input,
              status: "pending",
            });
            return [
              record,
              new Map(current).set(
                companyMemberRemovalRecordKey(input),
                record
              ),
            ];
          }),
        complete: (record) =>
          SynchronizedRef.update(state, (current) =>
            new Map(current).set(
              companyMemberRemovalRecordKey(record),
              new CompanyMemberRemovalRecord({
                ...record,
                status: "completed",
              })
            )
          ),
        find: (input) =>
          SynchronizedRef.get(state).pipe(
            Effect.map((current) =>
              Option.fromUndefinedOr(
                current.get(companyMemberRemovalRecordKey(input))
              )
            )
          ),
      });
    })
  );
}
