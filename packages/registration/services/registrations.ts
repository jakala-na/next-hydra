import type { CommerceAccount } from "@repo/commerce/domain/commerce-account";
import {
  type StoreConflict,
  type StoreError,
  VersionedKeyValueStore,
} from "@repo/versioned-store";
import { Clock, Context, Effect, Layer, Option, Random, Schema } from "effect";
import type { ApprovedDecision, RejectedDecision } from "../domain/approval";
import { InvitationId, RegistrationId } from "../domain/identity";
import {
  ApprovalProcessingRegistration,
  ApprovedRegistration,
  AwaitingApprovalRegistration,
  type CompanyRegistrationDetails,
  Registration,
  RejectedRegistration,
} from "../domain/registration";

export class RegistrationNotFound extends Schema.TaggedErrorClass<RegistrationNotFound>()(
  "RegistrationNotFound",
  {
    message: Schema.String,
    registrationId: RegistrationId,
  }
) {}

export class RegistrationNotFoundByInvitationId extends Schema.TaggedErrorClass<RegistrationNotFoundByInvitationId>()(
  "RegistrationNotFoundByInvitationId",
  {
    message: Schema.String,
    invitationId: InvitationId,
  }
) {}

export class RegistrationTransitionConflict extends Schema.TaggedErrorClass<RegistrationTransitionConflict>()(
  "RegistrationTransitionConflict",
  {
    message: Schema.String,
    registrationId: RegistrationId,
    currentState: Schema.String,
    attemptedDecision: Schema.Literals(["approved", "rejected"]),
  }
) {}

export class RegistrationConcurrentModification extends Schema.TaggedErrorClass<RegistrationConcurrentModification>()(
  "RegistrationConcurrentModification",
  {
    message: Schema.String,
    registrationId: RegistrationId,
  }
) {}

export class RegistrationAlreadyExists extends Schema.TaggedErrorClass<RegistrationAlreadyExists>()(
  "RegistrationAlreadyExists",
  {
    message: Schema.String,
    registrationId: RegistrationId,
  }
) {}

export class RegistrationPersistenceFailure extends Schema.TaggedErrorClass<RegistrationPersistenceFailure>()(
  "RegistrationPersistenceFailure",
  {
    message: Schema.String,
    registrationId: RegistrationId,
    operation: Schema.Literals(["read", "create", "update"]),
    cause: Schema.Defect,
  }
) {}

export type RegistrationReadError =
  | RegistrationNotFound
  | RegistrationPersistenceFailure;
export type RegistrationFindByInvitationError =
  | RegistrationNotFoundByInvitationId
  | RegistrationPersistenceFailure;
export type RegistrationCreateError =
  | RegistrationAlreadyExists
  | RegistrationPersistenceFailure;
export type RegistrationTransitionError =
  | RegistrationNotFound
  | RegistrationTransitionConflict
  | RegistrationConcurrentModification
  | RegistrationPersistenceFailure;

export interface CreateAwaitingApprovalRegistrationInput {
  readonly details: CompanyRegistrationDetails;
}

export interface MarkRegistrationApprovedInput {
  readonly registrationId: RegistrationId;
  readonly decision: ApprovedDecision;
  readonly commerceAccount: CommerceAccount;
  readonly invitationId: InvitationId;
}

export interface MarkRegistrationApprovalProcessingInput {
  readonly registrationId: RegistrationId;
  readonly decision: "approved" | "rejected";
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
      message: `Failed to ${operation} registration ${registrationId}: ${error.message}`,
      registrationId,
      operation,
      cause: error.cause,
    });

export class Registrations extends Context.Service<
  Registrations,
  {
    readonly createAwaitingApproval: (
      input: CreateAwaitingApprovalRegistrationInput
    ) => Effect.Effect<AwaitingApprovalRegistration, RegistrationCreateError>;
    readonly get: (
      id: RegistrationId
    ) => Effect.Effect<Registration, RegistrationReadError>;
    readonly findByInvitationId: (
      invitationId: InvitationId
    ) => Effect.Effect<ApprovedRegistration, RegistrationFindByInvitationError>;
    readonly markApprovalProcessing: (
      input: MarkRegistrationApprovalProcessingInput
    ) => Effect.Effect<Registration, RegistrationTransitionError>;
    readonly markApproved: (
      input: MarkRegistrationApprovedInput
    ) => Effect.Effect<ApprovedRegistration, RegistrationTransitionError>;
    readonly markRejected: (
      input: MarkRegistrationRejectedInput
    ) => Effect.Effect<RejectedRegistration, RegistrationTransitionError>;
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
      )(function* (input: CreateAwaitingApprovalRegistrationInput) {
        const id = RegistrationId.make(yield* Random.nextUUIDv4);
        const createdAt = yield* nowDate;
        const registration = new AwaitingApprovalRegistration({
          _tag: "AwaitingApprovalRegistration",
          status: "awaiting_approval",
          id,
          details: input.details,
          createdAt,
          updatedAt: createdAt,
        });

        yield* store
          .insert(registrationKey(id), Registration, registration)
          .pipe(
            Effect.catchTags({
              StoreConflict: () =>
                Effect.fail(
                  new RegistrationAlreadyExists({
                    message: `Registration ${id} already exists`,
                    registrationId: id,
                  })
                ),
              StoreError: (error) =>
                Effect.fail(mapStoreError(id, "create")(error)),
            })
          );

        return registration;
      });

      const findByInvitationId = Effect.fn("Registrations.findByInvitationId")(
        (invitationId: InvitationId) =>
          store.values(Registration).pipe(
            Effect.flatMap((registrations) => {
              const registration = registrations
                .map((versioned) => versioned.value)
                .find(
                  (candidate): candidate is ApprovedRegistration =>
                    candidate._tag === "ApprovedRegistration" &&
                    candidate.invitationId === invitationId
                );

              if (!registration) {
                return Effect.fail(
                  new RegistrationNotFoundByInvitationId({
                    message: `Registration for invitation ${invitationId} was not found`,
                    invitationId,
                  })
                );
              }

              return Effect.succeed(registration);
            }),
            Effect.catchTag("StoreError", (error) =>
              Effect.fail(
                mapStoreError(RegistrationId.make(error.key), "read")(error)
              )
            )
          )
      );

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
            message: `Cannot mark registration ${input.registrationId} as approved from ${current.value._tag}`,
            registrationId: input.registrationId,
            currentState: current.value._tag,
            attemptedDecision: "approved",
          });
        }

        if (current.value._tag === "RejectedRegistration") {
          return yield* new RegistrationTransitionConflict({
            message: `Cannot mark registration ${input.registrationId} as approved from ${current.value._tag}`,
            registrationId: input.registrationId,
            currentState: current.value._tag,
            attemptedDecision: "approved",
          });
        }

        const updatedAt = yield* nowDate;
        const approved = new ApprovedRegistration({
          _tag: "ApprovedRegistration",
          status: "approved",
          id: current.value.id,
          details: current.value.details,
          decision: input.decision,
          commerceAccount: input.commerceAccount,
          invitationId: input.invitationId,
          createdAt: current.value.createdAt,
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
          return current.value;
        }

        if (
          (current.value._tag === "ApprovedRegistration" &&
            input.decision === "approved") ||
          (current.value._tag === "RejectedRegistration" &&
            input.decision === "rejected")
        ) {
          return current.value;
        }

        if (current.value._tag !== "AwaitingApprovalRegistration") {
          return yield* new RegistrationTransitionConflict({
            message: `Cannot mark registration ${input.registrationId} as ${input.decision} from ${current.value._tag}`,
            registrationId: input.registrationId,
            currentState: current.value._tag,
            attemptedDecision: input.decision,
          });
        }

        const updatedAt = yield* nowDate;
        const processing = new ApprovalProcessingRegistration({
          _tag: "ApprovalProcessingRegistration",
          status: "approval_processing",
          id: current.value.id,
          details: current.value.details,
          requestedDecision: input.decision,
          createdAt: current.value.createdAt,
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

        return processing;
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
            message: `Cannot mark registration ${input.registrationId} as rejected from ${current.value._tag}`,
            registrationId: input.registrationId,
            currentState: current.value._tag,
            attemptedDecision: "rejected",
          });
        }

        if (current.value._tag === "ApprovedRegistration") {
          return yield* new RegistrationTransitionConflict({
            message: `Cannot mark registration ${input.registrationId} as rejected from ${current.value._tag}`,
            registrationId: input.registrationId,
            currentState: current.value._tag,
            attemptedDecision: "rejected",
          });
        }

        const updatedAt = yield* nowDate;
        const rejected = new RejectedRegistration({
          _tag: "RejectedRegistration",
          status: "rejected",
          id: current.value.id,
          details: current.value.details,
          decision: input.decision,
          createdAt: current.value.createdAt,
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
        findByInvitationId,
        markApprovalProcessing,
        get,
        markApproved,
        markRejected,
      };
    })
  );

  static readonly layerMemory = Registrations.layerStorage.pipe(
    Layer.provide(VersionedKeyValueStore.layerMemory)
  );
}
