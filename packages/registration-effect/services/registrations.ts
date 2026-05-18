import {
  Clock,
  Context,
  Effect,
  Layer,
  Option,
  Random,
  Ref,
  Schema,
} from "effect";
import type { ApprovedDecision, RejectedDecision } from "../domain/approval";
import type { CommerceAccount } from "../domain/commerce";
import { RegistrationId } from "../domain/identity";
import type { PendingRegistrationInvitation } from "../domain/invitations";
import {
  ApprovedRegistration,
  AwaitingApprovalRegistration,
  type CompanyRegistrationDetails,
  type Registration,
  RejectedRegistration,
} from "../domain/registration";

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

export type RegistrationCreateError = never;
export type RegistrationTransitionError =
  | RegistrationNotFound
  | RegistrationTransitionConflict;

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

type RegistrationStore = ReadonlyMap<RegistrationId, Registration>;

const nowDate = Clock.currentTimeMillis.pipe(
  Effect.map((time) => new Date(time))
);

export class Registrations extends Context.Service<
  Registrations,
  {
    readonly createAwaitingApproval: (
      input: CreateAwaitingApprovalRegistrationInput
    ) => Effect.Effect<AwaitingApprovalRegistration, RegistrationCreateError>;
    readonly get: (
      id: RegistrationId
    ) => Effect.Effect<Registration, RegistrationNotFound>;
    readonly markApproved: (
      input: MarkRegistrationApprovedInput
    ) => Effect.Effect<ApprovedRegistration, RegistrationTransitionError>;
    readonly markRejected: (
      input: MarkRegistrationRejectedInput
    ) => Effect.Effect<RejectedRegistration, RegistrationTransitionError>;
  }
>()("@repo/registration-effect/Registrations") {
  static readonly layerMemory = Layer.effect(
    Registrations,
    Effect.gen(function* () {
      const store = yield* Ref.make<RegistrationStore>(new Map());

      const get = Effect.fn("Registrations.get")((id: RegistrationId) =>
        Ref.get(store).pipe(
          Effect.flatMap((registrations) =>
            Option.fromNullishOr(registrations.get(id)).pipe(
              Effect.fromOption,
              Effect.mapError(
                () => new RegistrationNotFound({ registrationId: id })
              )
            )
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

        yield* Ref.update(store, (registrations) =>
          new Map(registrations).set(id, registration)
        );

        return registration;
      });

      const markApproved = Effect.fn("Registrations.markApproved")(function* (
        input: MarkRegistrationApprovedInput
      ) {
        const current = yield* get(input.registrationId);

        if (current._tag === "ApprovedRegistration") {
          return current;
        }

        if (current._tag === "RejectedRegistration") {
          return yield* new RegistrationTransitionConflict({
            registrationId: input.registrationId,
            currentState: current._tag,
            attemptedDecision: "approved",
          });
        }

        const updatedAt = yield* nowDate;
        const approved = new ApprovedRegistration({
          _tag: "ApprovedRegistration",
          id: current.id,
          details: current.details,
          decision: input.decision,
          commerceAccount: input.commerceAccount,
          invitation: input.invitation,
          createdAt: current.createdAt,
          updatedAt,
        });

        yield* Ref.update(store, (registrations) =>
          new Map(registrations).set(input.registrationId, approved)
        );

        return approved;
      });

      const markRejected = Effect.fn("Registrations.markRejected")(function* (
        input: MarkRegistrationRejectedInput
      ) {
        const current = yield* get(input.registrationId);

        if (current._tag === "RejectedRegistration") {
          return current;
        }

        if (current._tag === "ApprovedRegistration") {
          return yield* new RegistrationTransitionConflict({
            registrationId: input.registrationId,
            currentState: current._tag,
            attemptedDecision: "rejected",
          });
        }

        const updatedAt = yield* nowDate;
        const rejected = new RejectedRegistration({
          _tag: "RejectedRegistration",
          id: current.id,
          details: current.details,
          decision: input.decision,
          createdAt: current.createdAt,
          updatedAt,
        });

        yield* Ref.update(store, (registrations) =>
          new Map(registrations).set(input.registrationId, rejected)
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
}
