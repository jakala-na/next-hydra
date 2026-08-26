/* oxlint-disable max-classes-per-file, unicorn/throw-new-error -- The durable invitation repository owns its cohesive typed persistence vocabulary; Effect Schema tagged-error construction is not recognized by the lint analyzer. */
import {
  StoreFailureReason,
  VersionedKeyValueStore,
} from "@repo/versioned-store";
import type { StoreConflict, StoreError } from "@repo/versioned-store";
import { Context, Effect, Layer, Option, Schema } from "effect";

import { CompanyMemberInvitationId, InvitationId } from "../domain/identity";
import type { AcceptedAuthIdentity } from "../domain/identity";
import {
  AcceptedCompanyMemberInvitation,
  CompanyMemberInvitation,
  RevokedCompanyMemberInvitation,
} from "../domain/invitations";
import type {
  CompanyMemberInvitation as CompanyMemberInvitationType,
  PendingCompanyMemberInvitation,
} from "../domain/invitations";

export class CompanyMemberInvitationNotFound extends Schema.TaggedError<CompanyMemberInvitationNotFound>()(
  "CompanyMemberInvitationNotFound",
  {
    companyMemberInvitationId: Schema.optional(CompanyMemberInvitationId),
    message: Schema.String,
    providerInvitationId: Schema.optional(InvitationId),
  }
) {}

export class CompanyMemberInvitationPersistenceFailure extends Schema.TaggedError<CompanyMemberInvitationPersistenceFailure>()(
  "CompanyMemberInvitationPersistenceFailure",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.Literals(["read", "record", "accept", "revoke"]),
    reason: StoreFailureReason,
  }
) {}

export class CompanyMemberInvitationRecordConflict extends Schema.TaggedError<CompanyMemberInvitationRecordConflict>()(
  "CompanyMemberInvitationRecordConflict",
  {
    message: Schema.String,
  }
) {}

export type CompanyMemberInvitationRecordReadError =
  | CompanyMemberInvitationNotFound
  | CompanyMemberInvitationPersistenceFailure;

export interface AcceptCompanyMemberInvitationRecordInput {
  readonly acceptedAt: Date;
  readonly acceptedIdentity: AcceptedAuthIdentity;
  readonly companyMemberInvitationId: CompanyMemberInvitationId;
}

export interface RevokeCompanyMemberInvitationRecordInput {
  readonly companyMemberInvitationId: CompanyMemberInvitationId;
  readonly revokedAt: Date;
}

const recordKey: (id: CompanyMemberInvitationId) => string = String;

const persistenceFailure = (
  operation: CompanyMemberInvitationPersistenceFailure["operation"],
  error: StoreError
) =>
  new CompanyMemberInvitationPersistenceFailure({
    cause: error,
    message: `Failed to ${operation} company member invitation: ${error.message}`,
    operation,
    reason: error.reason,
  });

const conflictFailure = (
  operation: CompanyMemberInvitationPersistenceFailure["operation"],
  error: StoreConflict
) =>
  new CompanyMemberInvitationPersistenceFailure({
    cause: error,
    message: `Failed to ${operation} company member invitation: ${error.message}`,
    operation,
    reason: "unavailable",
  });

export class CompanyMemberInvitationRecords extends Context.Service<
  CompanyMemberInvitationRecords,
  {
    readonly recordIssued: (
      invitation: PendingCompanyMemberInvitation
    ) => Effect.Effect<
      PendingCompanyMemberInvitation,
      CompanyMemberInvitationPersistenceFailure
    >;
    readonly getById: (
      id: CompanyMemberInvitationId
    ) => Effect.Effect<
      CompanyMemberInvitationType,
      CompanyMemberInvitationRecordReadError
    >;
    readonly getByProviderInvitationId: (
      id: InvitationId
    ) => Effect.Effect<
      CompanyMemberInvitationType,
      | CompanyMemberInvitationRecordConflict
      | CompanyMemberInvitationRecordReadError
    >;
    readonly markAccepted: (
      input: AcceptCompanyMemberInvitationRecordInput
    ) => Effect.Effect<
      AcceptedCompanyMemberInvitation,
      | CompanyMemberInvitationNotFound
      | CompanyMemberInvitationPersistenceFailure
      | CompanyMemberInvitationRecordConflict
    >;
    readonly markRevoked: (
      input: RevokeCompanyMemberInvitationRecordInput
    ) => Effect.Effect<
      RevokedCompanyMemberInvitation,
      | CompanyMemberInvitationNotFound
      | CompanyMemberInvitationPersistenceFailure
      | CompanyMemberInvitationRecordConflict
    >;
  }
>()("@repo/registration/CompanyMemberInvitationRecords") {
  static readonly layerStorage = Layer.effect(
    CompanyMemberInvitationRecords,
    Effect.gen(function* () {
      const store = yield* VersionedKeyValueStore;

      const getVersionedById = Effect.fn(
        "CompanyMemberInvitationRecords.getVersionedById"
      )(function* (id: CompanyMemberInvitationId) {
        const stored = yield* store
          .get(recordKey(id), CompanyMemberInvitation)
          .pipe(Effect.mapError((error) => persistenceFailure("read", error)));

        return yield* Option.match(stored, {
          onNone: () =>
            Effect.fail(
              new CompanyMemberInvitationNotFound({
                companyMemberInvitationId: id,
                message: `Company member invitation ${id} was not found`,
              })
            ),
          onSome: Effect.succeed,
        });
      });

      const getById = Effect.fn("CompanyMemberInvitationRecords.getById")(
        (id: CompanyMemberInvitationId) =>
          getVersionedById(id).pipe(Effect.map(({ value }) => value))
      );

      const getByProviderInvitationId = Effect.fn(
        "CompanyMemberInvitationRecords.getByProviderInvitationId"
      )(function* (providerInvitationId: InvitationId) {
        const records = yield* store
          .values(CompanyMemberInvitation)
          .pipe(Effect.mapError((error) => persistenceFailure("read", error)));
        const matches = records.filter(
          ({ value }) => value.id === providerInvitationId
        );

        const [match] = matches;
        if (match === undefined) {
          return yield* new CompanyMemberInvitationNotFound({
            message: `Company member invitation for provider invitation ${providerInvitationId} was not found`,
            providerInvitationId,
          });
        }
        if (matches.length > 1) {
          return yield* new CompanyMemberInvitationRecordConflict({
            message: `Multiple company member invitations reference provider invitation ${providerInvitationId}`,
          });
        }

        return match.value;
      });

      const recordIssued = Effect.fn(
        "CompanyMemberInvitationRecords.recordIssued"
      )(function* (invitation: PendingCompanyMemberInvitation) {
        const id = invitation.intent.companyMemberInvitationId;
        yield* store
          .insert(recordKey(id), CompanyMemberInvitation, invitation)
          .pipe(
            Effect.mapError((error) =>
              error._tag === "StoreConflict"
                ? conflictFailure("record", error)
                : persistenceFailure("record", error)
            )
          );
        return invitation;
      });

      const markAccepted = Effect.fn(
        "CompanyMemberInvitationRecords.markAccepted"
      )(function* (input: AcceptCompanyMemberInvitationRecordInput) {
        const current = yield* getVersionedById(
          input.companyMemberInvitationId
        );

        if (current.value._tag === "AcceptedInvitation") {
          if (
            current.value.acceptedBy.authUserId ===
            input.acceptedIdentity.authUserId
          ) {
            return current.value;
          }

          return yield* new CompanyMemberInvitationRecordConflict({
            message: "Company member invitation was accepted by another user",
          });
        }

        if (current.value._tag === "RevokedInvitation") {
          return yield* new CompanyMemberInvitationRecordConflict({
            message: "Company member invitation has been revoked",
          });
        }

        const accepted = new AcceptedCompanyMemberInvitation({
          _tag: "AcceptedInvitation",
          acceptedAt: input.acceptedAt,
          acceptedBy: input.acceptedIdentity,
          createdAt: current.value.createdAt,
          expiresAt: current.value.expiresAt,
          id: current.value.id,
          intent: current.value.intent,
          issuedBy: current.value.issuedBy,
        });

        return yield* store
          .update(
            recordKey(input.companyMemberInvitationId),
            CompanyMemberInvitation,
            current,
            accepted
          )
          .pipe(
            Effect.as(accepted),
            Effect.mapError((error) =>
              error._tag === "StoreError"
                ? persistenceFailure("accept", error)
                : error
            ),
            Effect.catchTag("StoreConflict", () =>
              getVersionedById(input.companyMemberInvitationId).pipe(
                Effect.flatMap(({ value }) => {
                  if (
                    value._tag === "AcceptedInvitation" &&
                    value.acceptedBy.authUserId ===
                      input.acceptedIdentity.authUserId
                  ) {
                    return Effect.succeed(value);
                  }

                  return Effect.fail(
                    new CompanyMemberInvitationRecordConflict({
                      message:
                        "Company member invitation acceptance conflicted with another update",
                    })
                  );
                })
              )
            )
          );
      });

      const markRevoked = Effect.fn(
        "CompanyMemberInvitationRecords.markRevoked"
      )(function* (input: RevokeCompanyMemberInvitationRecordInput) {
        const current = yield* getVersionedById(
          input.companyMemberInvitationId
        );

        if (current.value._tag === "RevokedInvitation") {
          return current.value;
        }

        if (current.value._tag === "AcceptedInvitation") {
          return yield* new CompanyMemberInvitationRecordConflict({
            message: "An accepted company member invitation cannot be revoked",
          });
        }

        const revoked = new RevokedCompanyMemberInvitation({
          _tag: "RevokedInvitation",
          createdAt: current.value.createdAt,
          expiresAt: current.value.expiresAt,
          id: current.value.id,
          intent: current.value.intent,
          issuedBy: current.value.issuedBy,
          revokedAt: input.revokedAt,
        });

        return yield* store
          .update(
            recordKey(input.companyMemberInvitationId),
            CompanyMemberInvitation,
            current,
            revoked
          )
          .pipe(
            Effect.as(revoked),
            Effect.mapError((error) =>
              error._tag === "StoreError"
                ? persistenceFailure("revoke", error)
                : error
            ),
            Effect.catchTag("StoreConflict", () =>
              getVersionedById(input.companyMemberInvitationId).pipe(
                Effect.flatMap(({ value }) =>
                  value._tag === "RevokedInvitation"
                    ? Effect.succeed(value)
                    : Effect.fail(
                        new CompanyMemberInvitationRecordConflict({
                          message:
                            "Company member invitation revocation conflicted with another update",
                        })
                      )
                )
              )
            )
          );
      });

      return CompanyMemberInvitationRecords.of({
        getById,
        getByProviderInvitationId,
        markAccepted,
        markRevoked,
        recordIssued,
      });
    })
  );

  static readonly layerMemory =
    CompanyMemberInvitationRecords.layerStorage.pipe(
      Layer.provide(VersionedKeyValueStore.layerMemory)
    );
}
