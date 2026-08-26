/* oxlint-disable unicorn/throw-new-error -- Effect Schema tagged-error construction is not recognized by the lint analyzer. */
import {
  CompanyMemberInvitationNotFound,
  CompanyMemberInvitationPersistenceFailure,
  CompanyMemberInvitationRecordConflict,
} from "@repo/auth-contract/invitations";
import { VersionedKeyValueStore } from "@repo/versioned-store";
import type { StoreConflict, StoreError } from "@repo/versioned-store";
import { Context, Effect, Layer, Option } from "effect";

import type {
  AcceptedAuthIdentity,
  CompanyMemberInvitationId,
  CommerceBusinessUnitId,
  CommerceCustomerId,
  InvitationId,
} from "../domain/identity";
import {
  AcceptedCompanyMemberInvitation,
  CompanyMemberInvitation,
  CompanyMemberProvisionedMembership,
  ExpiredCompanyMemberInvitation,
  RevokedCompanyMemberInvitation,
} from "../domain/invitations";
import type {
  CompanyMemberInvitation as CompanyMemberInvitationType,
  PendingCompanyMemberInvitation,
} from "../domain/invitations";

export {
  CompanyMemberInvitationNotFound,
  CompanyMemberInvitationPersistenceFailure,
  CompanyMemberInvitationRecordConflict,
} from "@repo/auth-contract/invitations";

export type CompanyMemberInvitationRecordReadError =
  | CompanyMemberInvitationNotFound
  | CompanyMemberInvitationPersistenceFailure;

export interface AcceptCompanyMemberInvitationRecordInput {
  readonly acceptedAt: Date;
  readonly acceptedIdentity: AcceptedAuthIdentity;
  readonly companyMemberInvitationId: CompanyMemberInvitationId;
}

export interface MarkCompanyMemberInvitationProvisionedInput {
  readonly companyMemberInvitationId: CompanyMemberInvitationId;
  readonly customerId: CommerceCustomerId;
  readonly provisionedAt: Date;
}

export interface RevokeCompanyMemberInvitationRecordInput {
  readonly companyMemberInvitationId: CompanyMemberInvitationId;
  readonly revokedAt: Date;
}

export interface ExpireCompanyMemberInvitationRecordInput {
  readonly companyMemberInvitationId: CompanyMemberInvitationId;
  readonly expiredAt: Date;
}

export interface ClaimCompanyMemberInvitationReissueInput {
  readonly companyMemberInvitationId: CompanyMemberInvitationId;
  readonly replacementCompanyMemberInvitationId: CompanyMemberInvitationId;
}

export interface ReleaseCompanyMemberInvitationReissueInput {
  readonly companyMemberInvitationId: CompanyMemberInvitationId;
  readonly replacementCompanyMemberInvitationId: CompanyMemberInvitationId;
}

const recordKey: (id: CompanyMemberInvitationId) => string = String;

const storeDefect = (
  operation: CompanyMemberInvitationPersistenceFailure["operation"],
  error: StoreError
) =>
  new Error(
    `Company member invitation storage returned ${error.reason} while attempting to ${operation}`,
    { cause: error }
  );

const handleStoreError = (
  operation: CompanyMemberInvitationPersistenceFailure["operation"],
  error: StoreError
) =>
  error.reason === "unavailable"
    ? Effect.fail(
        new CompanyMemberInvitationPersistenceFailure({
          cause: error,
          message: `Failed to ${operation} company member invitation: ${error.message}`,
          operation,
          reason: "unavailable",
        })
      )
    : Effect.die(storeDefect(operation, error));

const dieOnUnexpectedStoreConflict = (
  operation: CompanyMemberInvitationPersistenceFailure["operation"],
  error: StoreConflict
) =>
  Effect.die(
    new Error(
      `Company member invitation storage conflicted unexpectedly while attempting to ${operation}`,
      { cause: error }
    )
  );

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
      CompanyMemberInvitationRecordReadError
    >;
    readonly listByBusinessUnit: (
      businessUnitId: CommerceBusinessUnitId
    ) => Effect.Effect<
      readonly CompanyMemberInvitationType[],
      CompanyMemberInvitationPersistenceFailure
    >;
    readonly claimReissue: (
      input: ClaimCompanyMemberInvitationReissueInput
    ) => Effect.Effect<
      ExpiredCompanyMemberInvitation | RevokedCompanyMemberInvitation,
      | CompanyMemberInvitationNotFound
      | CompanyMemberInvitationPersistenceFailure
      | CompanyMemberInvitationRecordConflict
    >;
    readonly releaseReissueClaim: (
      input: ReleaseCompanyMemberInvitationReissueInput
    ) => Effect.Effect<
      void,
      | CompanyMemberInvitationNotFound
      | CompanyMemberInvitationPersistenceFailure
      | CompanyMemberInvitationRecordConflict
    >;
    readonly markAccepted: (
      input: AcceptCompanyMemberInvitationRecordInput
    ) => Effect.Effect<
      AcceptedCompanyMemberInvitation,
      | CompanyMemberInvitationNotFound
      | CompanyMemberInvitationPersistenceFailure
      | CompanyMemberInvitationRecordConflict
    >;
    readonly markProvisioned: (
      input: MarkCompanyMemberInvitationProvisionedInput
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
    readonly markExpired: (
      input: ExpireCompanyMemberInvitationRecordInput
    ) => Effect.Effect<
      CompanyMemberInvitationType,
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
          .pipe(
            Effect.catchTag("StoreError", (error) =>
              handleStoreError("read", error)
            )
          );

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
          .pipe(
            Effect.catchTag("StoreError", (error) =>
              handleStoreError("read", error)
            )
          );
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
          return yield* Effect.die(
            new Error(
              `Multiple company member invitations reference provider invitation ${providerInvitationId}`
            )
          );
        }

        return match.value;
      });

      const listByBusinessUnit = Effect.fn(
        "CompanyMemberInvitationRecords.listByBusinessUnit"
      )(function* (businessUnitId: CommerceBusinessUnitId) {
        const records = yield* store
          .values(CompanyMemberInvitation)
          .pipe(
            Effect.catchTag("StoreError", (error) =>
              handleStoreError("read", error)
            )
          );

        return records
          .map(({ value }) => value)
          .filter(({ intent }) => intent.businessUnitId === businessUnitId);
      });

      const recordIssued = Effect.fn(
        "CompanyMemberInvitationRecords.recordIssued"
      )(function* (invitation: PendingCompanyMemberInvitation) {
        const id = invitation.intent.companyMemberInvitationId;
        yield* store
          .insert(recordKey(id), CompanyMemberInvitation, invitation)
          .pipe(
            Effect.catchTags({
              StoreConflict: (error) =>
                dieOnUnexpectedStoreConflict("record", error),
              StoreError: (error) => handleStoreError("record", error),
            })
          );
        return invitation;
      });

      const claimReissue = Effect.fn(
        "CompanyMemberInvitationRecords.claimReissue"
      )(function* (input: ClaimCompanyMemberInvitationReissueInput) {
        const current = yield* getVersionedById(
          input.companyMemberInvitationId
        );
        if (
          current.value._tag !== "ExpiredInvitation" &&
          current.value._tag !== "RevokedInvitation"
        ) {
          return yield* new CompanyMemberInvitationRecordConflict({
            message: "Only expired or revoked invitations can be reissued",
          });
        }
        if (current.value.replacementCompanyMemberInvitationId !== undefined) {
          return current.value;
        }

        const claimed =
          current.value._tag === "ExpiredInvitation"
            ? new ExpiredCompanyMemberInvitation({
                createdAt: current.value.createdAt,
                expiredAt: current.value.expiredAt,
                expiresAt: current.value.expiresAt,
                id: current.value.id,
                intent: current.value.intent,
                issuedBy: current.value.issuedBy,
                replacementCompanyMemberInvitationId:
                  input.replacementCompanyMemberInvitationId,
              })
            : new RevokedCompanyMemberInvitation({
                createdAt: current.value.createdAt,
                expiresAt: current.value.expiresAt,
                id: current.value.id,
                intent: current.value.intent,
                issuedBy: current.value.issuedBy,
                replacementCompanyMemberInvitationId:
                  input.replacementCompanyMemberInvitationId,
                revokedAt: current.value.revokedAt,
              });

        return yield* store
          .update(
            recordKey(input.companyMemberInvitationId),
            CompanyMemberInvitation,
            current,
            claimed
          )
          .pipe(
            Effect.as(claimed),
            Effect.catchTags({
              StoreConflict: () =>
                getVersionedById(input.companyMemberInvitationId).pipe(
                  Effect.flatMap(({ value }) =>
                    (value._tag === "ExpiredInvitation" ||
                      value._tag === "RevokedInvitation") &&
                    value.replacementCompanyMemberInvitationId !== undefined
                      ? Effect.succeed(value)
                      : Effect.fail(
                          new CompanyMemberInvitationRecordConflict({
                            message:
                              "Company member invitation reissue conflicted with another update",
                          })
                        )
                  )
                ),
              StoreError: (error) => handleStoreError("reissue", error),
            })
          );
      });

      const releaseReissueClaim = Effect.fn(
        "CompanyMemberInvitationRecords.releaseReissueClaim"
      )((input: ReleaseCompanyMemberInvitationReissueInput) => {
        const releaseAttempt = (
          remainingAttempts: number
        ): Effect.Effect<
          void,
          | CompanyMemberInvitationNotFound
          | CompanyMemberInvitationPersistenceFailure
          | CompanyMemberInvitationRecordConflict
        > =>
          Effect.gen(function* () {
            const current = yield* getVersionedById(
              input.companyMemberInvitationId
            );
            if (current.value._tag === "AcceptedInvitation") {
              return yield* Effect.void;
            }
            if (
              current.value._tag !== "ExpiredInvitation" &&
              current.value._tag !== "RevokedInvitation"
            ) {
              return yield* new CompanyMemberInvitationRecordConflict({
                message:
                  "Only expired or revoked invitation reissue claims can be released",
              });
            }
            if (
              current.value.replacementCompanyMemberInvitationId === undefined
            ) {
              return yield* Effect.void;
            }
            if (
              current.value.replacementCompanyMemberInvitationId !==
              input.replacementCompanyMemberInvitationId
            ) {
              return yield* new CompanyMemberInvitationRecordConflict({
                message:
                  "Company member invitation has a different replacement claim",
              });
            }

            const released =
              current.value._tag === "ExpiredInvitation"
                ? new ExpiredCompanyMemberInvitation({
                    createdAt: current.value.createdAt,
                    expiredAt: current.value.expiredAt,
                    expiresAt: current.value.expiresAt,
                    id: current.value.id,
                    intent: current.value.intent,
                    issuedBy: current.value.issuedBy,
                  })
                : new RevokedCompanyMemberInvitation({
                    createdAt: current.value.createdAt,
                    expiresAt: current.value.expiresAt,
                    id: current.value.id,
                    intent: current.value.intent,
                    issuedBy: current.value.issuedBy,
                    revokedAt: current.value.revokedAt,
                  });

            return yield* store
              .update(
                recordKey(input.companyMemberInvitationId),
                CompanyMemberInvitation,
                current,
                released
              )
              .pipe(
                Effect.catchTags({
                  StoreConflict: () =>
                    remainingAttempts > 0
                      ? releaseAttempt(remainingAttempts - 1)
                      : Effect.fail(
                          new CompanyMemberInvitationRecordConflict({
                            message:
                              "Company member invitation reissue claim release conflicted repeatedly",
                          })
                        ),
                  StoreError: (error) => handleStoreError("reissue", error),
                })
              );
          });

        return releaseAttempt(2);
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

        if (
          current.value._tag === "ExpiredInvitation" &&
          current.value.replacementCompanyMemberInvitationId !== undefined
        ) {
          return yield* new CompanyMemberInvitationRecordConflict({
            message:
              "Company member invitation acceptance conflicted with a replacement invitation",
          });
        }

        if (
          current.value._tag === "ExpiredInvitation" &&
          input.acceptedAt.getTime() >= current.value.expiresAt.getTime()
        ) {
          return yield* new CompanyMemberInvitationRecordConflict({
            message: "Company member invitation expired before acceptance",
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
            Effect.catchTags({
              StoreConflict: () =>
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
                ),
              StoreError: (error) => handleStoreError("accept", error),
            })
          );
      });

      const markProvisioned = Effect.fn(
        "CompanyMemberInvitationRecords.markProvisioned"
      )(function* (input: MarkCompanyMemberInvitationProvisionedInput) {
        const current = yield* getVersionedById(
          input.companyMemberInvitationId
        );

        if (current.value._tag !== "AcceptedInvitation") {
          return yield* new CompanyMemberInvitationRecordConflict({
            message:
              "Company member invitation must be accepted before provisioning can complete",
          });
        }

        if (current.value.provisionedMembership !== undefined) {
          if (
            current.value.provisionedMembership.customerId === input.customerId
          ) {
            return current.value;
          }

          return yield* new CompanyMemberInvitationRecordConflict({
            message:
              "Company member invitation was provisioned for another Commerce customer",
          });
        }

        const provisioned = new AcceptedCompanyMemberInvitation({
          _tag: "AcceptedInvitation",
          acceptedAt: current.value.acceptedAt,
          acceptedBy: current.value.acceptedBy,
          createdAt: current.value.createdAt,
          expiresAt: current.value.expiresAt,
          id: current.value.id,
          intent: current.value.intent,
          issuedBy: current.value.issuedBy,
          provisionedMembership: new CompanyMemberProvisionedMembership({
            customerId: input.customerId,
            provisionedAt: input.provisionedAt,
          }),
        });

        return yield* store
          .update(
            recordKey(input.companyMemberInvitationId),
            CompanyMemberInvitation,
            current,
            provisioned
          )
          .pipe(
            Effect.as(provisioned),
            Effect.catchTags({
              StoreConflict: () =>
                getVersionedById(input.companyMemberInvitationId).pipe(
                  Effect.flatMap(({ value }) => {
                    if (
                      value._tag === "AcceptedInvitation" &&
                      value.provisionedMembership?.customerId ===
                        input.customerId
                    ) {
                      return Effect.succeed(value);
                    }

                    return Effect.fail(
                      new CompanyMemberInvitationRecordConflict({
                        message:
                          "Company member invitation provisioning conflicted with another update",
                      })
                    );
                  })
                ),
              StoreError: (error) => handleStoreError("provision", error),
            })
          );
      });

      const markExpired = Effect.fn(
        "CompanyMemberInvitationRecords.markExpired"
      )(function* (input: ExpireCompanyMemberInvitationRecordInput) {
        const current = yield* getVersionedById(
          input.companyMemberInvitationId
        );

        if (current.value._tag !== "PendingInvitation") {
          return current.value;
        }

        const expired = new ExpiredCompanyMemberInvitation({
          _tag: "ExpiredInvitation",
          createdAt: current.value.createdAt,
          expiredAt: input.expiredAt,
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
            expired
          )
          .pipe(
            Effect.as(expired),
            Effect.catchTags({
              StoreConflict: () =>
                getVersionedById(input.companyMemberInvitationId).pipe(
                  Effect.map(({ value }) => value)
                ),
              StoreError: (error) => handleStoreError("expire", error),
            })
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
          replacementCompanyMemberInvitationId:
            current.value._tag === "ExpiredInvitation"
              ? current.value.replacementCompanyMemberInvitationId
              : undefined,
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
            Effect.catchTags({
              StoreConflict: () =>
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
                ),
              StoreError: (error) => handleStoreError("revoke", error),
            })
          );
      });

      return CompanyMemberInvitationRecords.of({
        claimReissue,
        getById,
        getByProviderInvitationId,
        listByBusinessUnit,
        markAccepted,
        markExpired,
        markProvisioned,
        markRevoked,
        recordIssued,
        releaseReissueClaim,
      });
    })
  );

  static readonly layerMemory =
    CompanyMemberInvitationRecords.layerStorage.pipe(
      Layer.provide(VersionedKeyValueStore.layerMemory)
    );
}
