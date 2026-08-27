import type { StoreKey } from "@repo/commerce/store";
import {
  StoreFailureReason,
  VersionedKeyValueStore,
} from "@repo/versioned-store";
import type { StoreConflict, StoreError } from "@repo/versioned-store";
import { Clock, Context, Effect, Layer, Option, Schema } from "effect";

import type { ApprovedDecision, RejectedDecision } from "../domain/approval";
import type { AuthUserId, InvitationId } from "../domain/identity";
import { RegistrationId } from "../domain/identity";
import {
  ApprovalProcessingRegistration,
  ApprovedRegistration,
  AwaitingApprovalRegistration,
  Registration,
  RegistrationOnboardingStatus,
  RejectedRegistration,
} from "../domain/registration";
import type { CompanyRegistrationDetails } from "../domain/registration";

export class RegistrationNotFound extends Schema.TaggedError<RegistrationNotFound>()(
  "RegistrationNotFound",
  {
    message: Schema.String,
    registrationId: RegistrationId,
  }
) {}

export class RegistrationTransitionConflict extends Schema.TaggedError<RegistrationTransitionConflict>()(
  "RegistrationTransitionConflict",
  {
    attemptedDecision: Schema.Literals(["approved", "rejected"]),
    currentState: Schema.String,
    message: Schema.String,
    registrationId: RegistrationId,
  }
) {}

export class RegistrationOnboardingTransitionConflict extends Schema.TaggedError<RegistrationOnboardingTransitionConflict>()(
  "RegistrationOnboardingTransitionConflict",
  {
    attemptedStatus: RegistrationOnboardingStatus,
    currentState: Schema.String,
    message: Schema.String,
    registrationId: RegistrationId,
  }
) {}

export class RegistrationConcurrentModification extends Schema.TaggedError<RegistrationConcurrentModification>()(
  "RegistrationConcurrentModification",
  {
    message: Schema.String,
    registrationId: RegistrationId,
  }
) {}

export class RegistrationDiscardConflict extends Schema.TaggedError<RegistrationDiscardConflict>()(
  "RegistrationDiscardConflict",
  {
    currentState: Schema.String,
    message: Schema.String,
    registrationId: RegistrationId,
  }
) {}

export class RegistrationPersistenceFailure extends Schema.TaggedError<RegistrationPersistenceFailure>()(
  "RegistrationPersistenceFailure",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.Literals(["read", "create", "delete", "update"]),
    reason: StoreFailureReason,
    registrationId: RegistrationId,
  }
) {}

export type RegistrationReadError =
  | RegistrationNotFound
  | RegistrationPersistenceFailure;
export type RegistrationCreateError = RegistrationPersistenceFailure;
export type RegistrationDiscardError =
  | RegistrationDiscardConflict
  | RegistrationConcurrentModification
  | RegistrationPersistenceFailure;
export type RegistrationTransitionError =
  | RegistrationNotFound
  | RegistrationTransitionConflict
  | RegistrationOnboardingTransitionConflict
  | RegistrationConcurrentModification
  | RegistrationPersistenceFailure;
export type RegistrationDecisionTransitionError =
  | RegistrationNotFound
  | RegistrationTransitionConflict
  | RegistrationConcurrentModification
  | RegistrationPersistenceFailure;
export type RegistrationOnboardingTransitionError =
  | RegistrationNotFound
  | RegistrationOnboardingTransitionConflict
  | RegistrationConcurrentModification
  | RegistrationPersistenceFailure;

export interface CreateAwaitingApprovalRegistrationInput {
  readonly details: CompanyRegistrationDetails;
  readonly storeKey: StoreKey;
  readonly submittedByAuthUserId?: AuthUserId;
}

export type MarkRegistrationApprovedInput = {
  readonly registrationId: RegistrationId;
  readonly decision: ApprovedDecision;
} & (
  | { readonly invitationId: InvitationId }
  | { readonly acceptedAuthUserId: AuthUserId }
);

export type MarkRegistrationOnboardingStatusInput =
  | {
      readonly acceptedAuthUserId: AuthUserId;
      readonly registrationId: RegistrationId;
      readonly status: "accepted";
    }
  | {
      readonly registrationId: RegistrationId;
      readonly status: Exclude<
        RegistrationOnboardingStatus,
        "accepted" | "invited"
      >;
    };

const submittedIdentityFields = (submittedByAuthUserId?: AuthUserId) =>
  submittedByAuthUserId === undefined ? {} : { submittedByAuthUserId };

export interface MarkRegistrationApprovalProcessingInput {
  readonly registrationId: RegistrationId;
  readonly decision: "approved" | "rejected";
}

export interface MarkRegistrationApprovalProcessingResult {
  readonly registration: Registration;
  readonly transitioned: boolean;
}

export interface MarkRegistrationRejectedInput {
  readonly registrationId: RegistrationId;
  readonly decision: RejectedDecision;
}

const nowDate = Clock.currentTimeMillis.pipe(
  Effect.map((time) => new Date(time))
);

const registrationKey = (id: RegistrationId) => String(id);

const mapStoreUpdateConflict =
  (registrationId: RegistrationId) => (_error: StoreConflict) =>
    new RegistrationConcurrentModification({
      message: `Registration ${registrationId} was modified concurrently`,
      registrationId,
    });

const mapStoreError =
  (
    registrationId: RegistrationId,
    operation: RegistrationPersistenceFailure["operation"]
  ) =>
  (error: StoreError) =>
    new RegistrationPersistenceFailure({
      cause: error.cause,
      message: `Failed to ${operation} registration ${registrationId}: ${error.message}`,
      operation,
      reason: error.reason,
      registrationId,
    });

export class Registrations extends Context.Service<
  Registrations,
  {
    readonly createAwaitingApproval: (
      input: CreateAwaitingApprovalRegistrationInput
    ) => Effect.Effect<AwaitingApprovalRegistration, RegistrationCreateError>;
    readonly discardAwaitingApproval: (
      id: RegistrationId
    ) => Effect.Effect<void, RegistrationDiscardError>;
    readonly get: (
      id: RegistrationId
    ) => Effect.Effect<Registration, RegistrationReadError>;
    readonly markApprovalProcessing: (
      input: MarkRegistrationApprovalProcessingInput
    ) => Effect.Effect<
      MarkRegistrationApprovalProcessingResult,
      RegistrationDecisionTransitionError
    >;
    readonly markApproved: (
      input: MarkRegistrationApprovedInput
    ) => Effect.Effect<
      ApprovedRegistration,
      RegistrationDecisionTransitionError
    >;
    readonly markOnboardingStatus: (
      input: MarkRegistrationOnboardingStatusInput
    ) => Effect.Effect<
      ApprovedRegistration,
      RegistrationOnboardingTransitionError
    >;
    readonly markRejected: (
      input: MarkRegistrationRejectedInput
    ) => Effect.Effect<
      RejectedRegistration,
      RegistrationDecisionTransitionError
    >;
  }
>()("@repo/registration/Registrations") {
  static readonly layerStorage = Layer.effect(
    Registrations,
    Effect.gen(function* () {
      const store = yield* VersionedKeyValueStore;

      const get = Effect.fn("Registrations.get")((id: RegistrationId) =>
        store.get(registrationKey(id), Registration).pipe(
          Effect.flatMap((registration) =>
            Option.match(registration, {
              onNone: () =>
                Effect.fail(
                  new RegistrationNotFound({
                    message: `Registration ${id} was not found`,
                    registrationId: id,
                  })
                ),
              onSome: (versioned) => Effect.succeed(versioned.value),
            })
          ),
          Effect.catchTag("StoreError", (error) =>
            Effect.fail(mapStoreError(id, "read")(error))
          )
        )
      );

      const createAwaitingApproval = Effect.fn(
        "Registrations.createAwaitingApproval"
      )((input: CreateAwaitingApprovalRegistrationInput) => {
        const insertWithFreshId = (
          remainingAttempts: number
        ): Effect.Effect<
          AwaitingApprovalRegistration,
          RegistrationPersistenceFailure
        > =>
          Effect.gen(function* () {
            const id = RegistrationId.make(
              yield* Effect.sync(() => crypto.randomUUID())
            );
            const createdAt = yield* nowDate;
            const registration = new AwaitingApprovalRegistration({
              _tag: "AwaitingApprovalRegistration",
              createdAt,
              details: input.details,
              id,
              status: "awaiting_approval",
              storeKey: input.storeKey,
              ...submittedIdentityFields(input.submittedByAuthUserId),
              updatedAt: createdAt,
            });

            yield* store.insert(
              registrationKey(id),
              Registration,
              registration
            );

            return registration;
          }).pipe(
            Effect.catchTags({
              StoreConflict: (error) =>
                remainingAttempts > 1
                  ? Effect.suspend(() =>
                      insertWithFreshId(remainingAttempts - 1)
                    )
                  : Effect.die(error),
              StoreError: (error) =>
                Effect.fail(
                  mapStoreError(RegistrationId.make(error.key), "create")(error)
                ),
            })
          );

        return insertWithFreshId(3);
      });

      const discardAwaitingApproval = Effect.fn(
        "Registrations.discardAwaitingApproval"
      )(function* (id: RegistrationId) {
        const key = registrationKey(id);
        const current = yield* store
          .get(key, Registration)
          .pipe(
            Effect.catchTag("StoreError", (error) =>
              Effect.fail(mapStoreError(id, "read")(error))
            )
          );

        if (Option.isNone(current)) {
          return;
        }

        if (current.value.value._tag !== "AwaitingApprovalRegistration") {
          return yield* new RegistrationDiscardConflict({
            currentState: current.value.value._tag,
            message: `Cannot discard registration ${id} from ${current.value.value._tag}`,
            registrationId: id,
          });
        }

        yield* store.remove(key, current.value).pipe(
          Effect.catchTags({
            StoreConflict: (error) =>
              Effect.fail(mapStoreUpdateConflict(id)(error)),
            StoreError: (error) =>
              Effect.fail(mapStoreError(id, "delete")(error)),
          })
        );
      });

      const markApproved = Effect.fn("Registrations.markApproved")(function* (
        input: MarkRegistrationApprovedInput
      ) {
        const key = registrationKey(input.registrationId);
        const current = yield* store.get(key, Registration).pipe(
          Effect.flatMap((registration) =>
            Option.match(registration, {
              onNone: () =>
                Effect.fail(
                  new RegistrationNotFound({
                    message: `Registration ${input.registrationId} was not found`,
                    registrationId: input.registrationId,
                  })
                ),
              onSome: Effect.succeed,
            })
          ),
          Effect.catchTag("StoreError", (error) =>
            Effect.fail(mapStoreError(input.registrationId, "read")(error))
          )
        );

        if (current.value._tag === "ApprovedRegistration") {
          return current.value;
        }

        if (
          current.value._tag === "ApprovalProcessingRegistration" &&
          current.value.requestedDecision !== "approved"
        ) {
          return yield* new RegistrationTransitionConflict({
            attemptedDecision: "approved",
            currentState: current.value._tag,
            message: `Cannot mark registration ${input.registrationId} as approved from ${current.value._tag}`,
            registrationId: input.registrationId,
          });
        }

        if (current.value._tag === "RejectedRegistration") {
          return yield* new RegistrationTransitionConflict({
            attemptedDecision: "approved",
            currentState: current.value._tag,
            message: `Cannot mark registration ${input.registrationId} as approved from ${current.value._tag}`,
            registrationId: input.registrationId,
          });
        }

        const { submittedByAuthUserId } = current.value;
        const invalidApprovalEvidence =
          submittedByAuthUserId === undefined
            ? !("invitationId" in input)
            : !(
                "acceptedAuthUserId" in input &&
                input.acceptedAuthUserId === submittedByAuthUserId
              );
        if (invalidApprovalEvidence) {
          return yield* new RegistrationTransitionConflict({
            attemptedDecision: "approved",
            currentState: current.value._tag,
            message: `Registration ${input.registrationId} approval evidence does not match its submission identity`,
            registrationId: input.registrationId,
          });
        }

        const updatedAt = yield* nowDate;
        const commonApproval = {
          _tag: "ApprovedRegistration" as const,
          createdAt: current.value.createdAt,
          decision: input.decision,
          details: current.value.details,
          id: current.value.id,
          ...submittedIdentityFields(current.value.submittedByAuthUserId),
          status: "approved" as const,
          storeKey: current.value.storeKey,
          updatedAt,
        };
        const approved =
          "invitationId" in input
            ? new ApprovedRegistration({
                ...commonApproval,
                invitationId: input.invitationId,
                onboarding: { status: "invited" },
              })
            : new ApprovedRegistration({
                ...commonApproval,
                onboarding: {
                  acceptedAuthUserId: input.acceptedAuthUserId,
                  status: "accepted",
                },
              });

        yield* store.update(key, Registration, current, approved).pipe(
          Effect.catchTags({
            StoreConflict: (error) =>
              Effect.fail(mapStoreUpdateConflict(input.registrationId)(error)),
            StoreError: (error) =>
              Effect.fail(mapStoreError(input.registrationId, "update")(error)),
          })
        );

        return approved;
      });

      const markOnboardingStatus = Effect.fn(
        "Registrations.markOnboardingStatus"
      )(function* (input: MarkRegistrationOnboardingStatusInput) {
        const key = registrationKey(input.registrationId);
        const current = yield* store.get(key, Registration).pipe(
          Effect.flatMap((registration) =>
            Option.match(registration, {
              onNone: () =>
                Effect.fail(
                  new RegistrationNotFound({
                    message: `Registration ${input.registrationId} was not found`,
                    registrationId: input.registrationId,
                  })
                ),
              onSome: Effect.succeed,
            })
          ),
          Effect.catchTag("StoreError", (error) =>
            Effect.fail(mapStoreError(input.registrationId, "read")(error))
          )
        );

        if (
          current.value._tag === "ApprovedRegistration" &&
          current.value.onboardingStatus === input.status
        ) {
          if (
            input.status === "accepted" &&
            current.value.acceptedAuthUserId !== input.acceptedAuthUserId
          ) {
            return yield* new RegistrationOnboardingTransitionConflict({
              attemptedStatus: input.status,
              currentState: current.value.onboardingStatus,
              message: `Registration ${input.registrationId} was accepted by a different auth user`,
              registrationId: input.registrationId,
            });
          }

          return current.value;
        }

        if (
          current.value._tag !== "ApprovedRegistration" ||
          current.value.onboardingStatus !== "invited"
        ) {
          const currentState =
            current.value._tag === "ApprovedRegistration"
              ? current.value.onboardingStatus
              : current.value._tag;

          return yield* new RegistrationOnboardingTransitionConflict({
            attemptedStatus: input.status,
            currentState,
            message: `Cannot mark registration ${input.registrationId} onboarding as ${input.status} from ${currentState}`,
            registrationId: input.registrationId,
          });
        }

        const updatedAt = yield* nowDate;
        const approved = new ApprovedRegistration({
          _tag: "ApprovedRegistration",
          createdAt: current.value.createdAt,
          decision: current.value.decision,
          details: current.value.details,
          id: current.value.id,
          invitationId: current.value.invitationId,
          onboarding:
            input.status === "accepted"
              ? {
                  acceptedAuthUserId: input.acceptedAuthUserId,
                  status: input.status,
                }
              : { status: input.status },
          status: "approved",
          storeKey: current.value.storeKey,
          ...submittedIdentityFields(current.value.submittedByAuthUserId),
          updatedAt,
        });

        yield* store.update(key, Registration, current, approved).pipe(
          Effect.catchTags({
            StoreConflict: (error) =>
              Effect.fail(mapStoreUpdateConflict(input.registrationId)(error)),
            StoreError: (error) =>
              Effect.fail(mapStoreError(input.registrationId, "update")(error)),
          })
        );

        return approved;
      });

      const markApprovalProcessing = Effect.fn(
        "Registrations.markApprovalProcessing"
      )(function* (input: MarkRegistrationApprovalProcessingInput) {
        const key = registrationKey(input.registrationId);
        const current = yield* store.get(key, Registration).pipe(
          Effect.flatMap((registration) =>
            Option.match(registration, {
              onNone: () =>
                Effect.fail(
                  new RegistrationNotFound({
                    message: `Registration ${input.registrationId} was not found`,
                    registrationId: input.registrationId,
                  })
                ),
              onSome: Effect.succeed,
            })
          ),
          Effect.catchTag("StoreError", (error) =>
            Effect.fail(mapStoreError(input.registrationId, "read")(error))
          )
        );

        if (
          current.value._tag === "ApprovalProcessingRegistration" &&
          current.value.requestedDecision === input.decision
        ) {
          return { registration: current.value, transitioned: false };
        }

        if (
          (current.value._tag === "ApprovedRegistration" &&
            input.decision === "approved") ||
          (current.value._tag === "RejectedRegistration" &&
            input.decision === "rejected")
        ) {
          return { registration: current.value, transitioned: false };
        }

        if (current.value._tag !== "AwaitingApprovalRegistration") {
          return yield* new RegistrationTransitionConflict({
            attemptedDecision: input.decision,
            currentState: current.value._tag,
            message: `Cannot mark registration ${input.registrationId} as ${input.decision} from ${current.value._tag}`,
            registrationId: input.registrationId,
          });
        }

        const updatedAt = yield* nowDate;
        const processing = new ApprovalProcessingRegistration({
          _tag: "ApprovalProcessingRegistration",
          createdAt: current.value.createdAt,
          details: current.value.details,
          id: current.value.id,
          requestedDecision: input.decision,
          status: "approval_processing",
          storeKey: current.value.storeKey,
          ...submittedIdentityFields(current.value.submittedByAuthUserId),
          updatedAt,
        });

        yield* store.update(key, Registration, current, processing).pipe(
          Effect.catchTags({
            StoreConflict: (error) =>
              Effect.fail(mapStoreUpdateConflict(input.registrationId)(error)),
            StoreError: (error) =>
              Effect.fail(mapStoreError(input.registrationId, "update")(error)),
          })
        );

        return { registration: processing, transitioned: true };
      });

      const markRejected = Effect.fn("Registrations.markRejected")(function* (
        input: MarkRegistrationRejectedInput
      ) {
        const key = registrationKey(input.registrationId);
        const current = yield* store.get(key, Registration).pipe(
          Effect.flatMap((registration) =>
            Option.match(registration, {
              onNone: () =>
                Effect.fail(
                  new RegistrationNotFound({
                    message: `Registration ${input.registrationId} was not found`,
                    registrationId: input.registrationId,
                  })
                ),
              onSome: Effect.succeed,
            })
          ),
          Effect.catchTag("StoreError", (error) =>
            Effect.fail(mapStoreError(input.registrationId, "read")(error))
          )
        );

        if (current.value._tag === "RejectedRegistration") {
          return current.value;
        }

        if (
          current.value._tag === "ApprovalProcessingRegistration" &&
          current.value.requestedDecision !== "rejected"
        ) {
          return yield* new RegistrationTransitionConflict({
            attemptedDecision: "rejected",
            currentState: current.value._tag,
            message: `Cannot mark registration ${input.registrationId} as rejected from ${current.value._tag}`,
            registrationId: input.registrationId,
          });
        }

        if (current.value._tag === "ApprovedRegistration") {
          return yield* new RegistrationTransitionConflict({
            attemptedDecision: "rejected",
            currentState: current.value._tag,
            message: `Cannot mark registration ${input.registrationId} as rejected from ${current.value._tag}`,
            registrationId: input.registrationId,
          });
        }

        const updatedAt = yield* nowDate;
        const rejected = new RejectedRegistration({
          _tag: "RejectedRegistration",
          createdAt: current.value.createdAt,
          decision: input.decision,
          details: current.value.details,
          id: current.value.id,
          status: "rejected",
          storeKey: current.value.storeKey,
          ...submittedIdentityFields(current.value.submittedByAuthUserId),
          updatedAt,
        });

        yield* store.update(key, Registration, current, rejected).pipe(
          Effect.catchTags({
            StoreConflict: (error) =>
              Effect.fail(mapStoreUpdateConflict(input.registrationId)(error)),
            StoreError: (error) =>
              Effect.fail(mapStoreError(input.registrationId, "update")(error)),
          })
        );

        return rejected;
      });

      return {
        createAwaitingApproval,
        discardAwaitingApproval,
        get,
        markApprovalProcessing,
        markApproved,
        markOnboardingStatus,
        markRejected,
      };
    })
  );

  static readonly layerMemory = Registrations.layerStorage.pipe(
    Layer.provide(VersionedKeyValueStore.layerMemory)
  );
}
