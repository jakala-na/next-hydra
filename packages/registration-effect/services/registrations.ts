import { Clock, Context, Effect, Layer, Option, Random, Schema } from "effect";
import type { ApprovedDecision, RejectedDecision } from "../domain/approval";
import type { CommerceAccount } from "../domain/commerce";
import { RegistrationId } from "../domain/identity";
import type { PendingRegistrationInvitation } from "../domain/invitations";
import {
  ApprovedRegistration,
  AwaitingApprovalRegistration,
  type CompanyRegistrationDetails,
  Registration,
  RejectedRegistration,
} from "../domain/registration";
import {
  type StoreConflict,
  type StoreError,
  VersionedKeyValueStore,
} from "./versioned-key-value-store";

export class RegistrationNotFound extends Schema.TaggedErrorClass<RegistrationNotFound>()(
  "RegistrationNotFound",
  {
    registrationId: RegistrationId,
  }
) {}

export class RegistrationTransitionConflict extends Schema.TaggedErrorClass<RegistrationTransitionConflict>()(
  "RegistrationTransitionConflict",
  {
    registrationId: RegistrationId,
    currentState: Schema.String,
    attemptedDecision: Schema.Literals(["approved", "rejected"]),
  }
) {}

export class RegistrationConcurrentModification extends Schema.TaggedErrorClass<RegistrationConcurrentModification>()(
  "RegistrationConcurrentModification",
  {
    registrationId: RegistrationId,
  }
) {}

export class RegistrationAlreadyExists extends Schema.TaggedErrorClass<RegistrationAlreadyExists>()(
  "RegistrationAlreadyExists",
  {
    registrationId: RegistrationId,
  }
) {}

export class RegistrationPersistenceFailure extends Schema.TaggedErrorClass<RegistrationPersistenceFailure>()(
  "RegistrationPersistenceFailure",
  {
    registrationId: RegistrationId,
    operation: Schema.Literals(["read", "create", "update"]),
    cause: Schema.Defect,
  }
) {}

export type RegistrationReadError =
  | RegistrationNotFound
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
  readonly invitation: PendingRegistrationInvitation;
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
    new RegistrationConcurrentModification({ registrationId });

const mapStoreError =
  (
    registrationId: RegistrationId,
    operation: RegistrationPersistenceFailure["operation"]
  ) =>
  (error: StoreError) =>
    new RegistrationPersistenceFailure({
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
    readonly markApproved: (
      input: MarkRegistrationApprovedInput
    ) => Effect.Effect<ApprovedRegistration, RegistrationTransitionError>;
    readonly markRejected: (
      input: MarkRegistrationRejectedInput
    ) => Effect.Effect<RejectedRegistration, RegistrationTransitionError>;
  }
>()("@repo/registration-effect/Registrations") {
  static readonly layerStorage = Layer.effect(
    Registrations,
    Effect.gen(function* () {
      const store = yield* VersionedKeyValueStore;

      const get = Effect.fn("Registrations.get")((id: RegistrationId) =>
        store.get(registrationKey(id), Registration).pipe(
          Effect.flatMap((registration) =>
            Option.match(registration, {
              onNone: () =>
                Effect.fail(new RegistrationNotFound({ registrationId: id })),
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
                  new RegistrationAlreadyExists({ registrationId: id })
                ),
              StoreError: (error) =>
                Effect.fail(mapStoreError(id, "create")(error)),
            })
          );

        return registration;
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

        if (current.value._tag === "RejectedRegistration") {
          return yield* new RegistrationTransitionConflict({
            registrationId: input.registrationId,
            currentState: current.value._tag,
            attemptedDecision: "approved",
          });
        }

        const updatedAt = yield* nowDate;
        const approved = new ApprovedRegistration({
          _tag: "ApprovedRegistration",
          id: current.value.id,
          details: current.value.details,
          decision: input.decision,
          commerceAccount: input.commerceAccount,
          invitation: input.invitation,
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

        if (current.value._tag === "ApprovedRegistration") {
          return yield* new RegistrationTransitionConflict({
            registrationId: input.registrationId,
            currentState: current.value._tag,
            attemptedDecision: "rejected",
          });
        }

        const updatedAt = yield* nowDate;
        const rejected = new RejectedRegistration({
          _tag: "RejectedRegistration",
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
