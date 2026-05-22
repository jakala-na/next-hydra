import { Context, Effect, Layer, Ref, Schema } from "effect";
import {
  CommerceAccount,
  CommerceAssociateMembership,
  CommerceCustomer,
} from "../domain/commerce";
import {
  type AcceptedAuthIdentity,
  CommerceBusinessUnitId,
  CommerceCustomerId,
  type RegistrationId,
} from "../domain/identity";
import type {
  ApprovedRegistration,
  Registration,
} from "../domain/registration";
import type { CompanyRole } from "../domain/roles";

export class CommerceAccountError extends Schema.TaggedErrorClass<CommerceAccountError>()(
  "CommerceAccountError",
  {
    reason: Schema.String,
  }
) {}

export interface LinkRegistrantIdentityInput {
  readonly registration: ApprovedRegistration;
  readonly acceptedIdentity: AcceptedAuthIdentity;
}

export interface AddAssociateInput {
  readonly businessUnitId: CommerceBusinessUnitId;
  readonly acceptedIdentity: AcceptedAuthIdentity;
  readonly role: Extract<CompanyRole, "associate">;
}

interface CommerceState {
  readonly accountsByRegistration: ReadonlyMap<RegistrationId, CommerceAccount>;
  readonly customersByAuthUserId: ReadonlyMap<string, CommerceCustomer>;
  readonly linkedRegistrantIdentities: ReadonlyMap<
    RegistrationId,
    AcceptedAuthIdentity
  >;
  readonly associatesByBusinessUnit: ReadonlyMap<
    CommerceBusinessUnitId,
    readonly CommerceAssociateMembership[]
  >;
}

const initialState: CommerceState = {
  accountsByRegistration: new Map(),
  customersByAuthUserId: new Map(),
  linkedRegistrantIdentities: new Map(),
  associatesByBusinessUnit: new Map(),
};

export class CommerceAccounts extends Context.Service<
  CommerceAccounts,
  {
    readonly createFromRegistration: (
      registration: Registration
    ) => Effect.Effect<CommerceAccount, CommerceAccountError>;
    readonly linkRegistrantIdentity: (
      input: LinkRegistrantIdentityInput
    ) => Effect.Effect<CommerceAccount, CommerceAccountError>;
    readonly addAssociate: (
      input: AddAssociateInput
    ) => Effect.Effect<CommerceAssociateMembership, CommerceAccountError>;
  }
>()("@repo/registration-effect/CommerceAccounts") {
  static readonly layerMemory = Layer.effect(
    CommerceAccounts,
    Effect.gen(function* () {
      const state = yield* Ref.make<CommerceState>(initialState);

      const createFromRegistration = Effect.fn(
        "CommerceAccounts.createFromRegistration"
      )((registration: Registration) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(state);
          const existing = current.accountsByRegistration.get(registration.id);
          if (existing) {
            return existing;
          }

          if (registration._tag === "RejectedRegistration") {
            return yield* new CommerceAccountError({
              reason: "Cannot provision commerce for a rejected registration",
            });
          }

          const account = new CommerceAccount({
            registrationId: registration.id,
            customerId: CommerceCustomerId.make(`customer-${registration.id}`),
            businessUnitId: CommerceBusinessUnitId.make(
              `business-unit-${registration.id}`
            ),
          });

          yield* Ref.update(state, (latest) => ({
            ...latest,
            accountsByRegistration: new Map(latest.accountsByRegistration).set(
              registration.id,
              account
            ),
          }));

          return account;
        })
      );

      const linkRegistrantIdentity = Effect.fn(
        "CommerceAccounts.linkRegistrantIdentity"
      )((input: LinkRegistrantIdentityInput) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(state);

          const registrationId = input.registration.id;
          const account = current.accountsByRegistration.get(registrationId);

          if (!account) {
            return yield* new CommerceAccountError({
              reason: "Commerce account does not exist for registration",
            });
          }

          yield* Ref.update(state, (latest) => ({
            ...latest,
            linkedRegistrantIdentities: new Map(
              latest.linkedRegistrantIdentities
            ).set(registrationId, input.acceptedIdentity),
          }));

          return account;
        })
      );

      const addAssociate = Effect.fn("CommerceAccounts.addAssociate")(
        (input: AddAssociateInput) =>
          Effect.gen(function* () {
            const current = yield* Ref.get(state);
            const account = [...current.accountsByRegistration.values()].find(
              (candidate) => candidate.businessUnitId === input.businessUnitId
            );

            if (!account) {
              return yield* new CommerceAccountError({
                reason: "Commerce account does not exist for business unit",
              });
            }

            const customer =
              current.customersByAuthUserId.get(
                input.acceptedIdentity.authUserId
              ) ??
              new CommerceCustomer({
                customerId: CommerceCustomerId.make(
                  `customer-${input.acceptedIdentity.authUserId}`
                ),
                authUserId: input.acceptedIdentity.authUserId,
                email: input.acceptedIdentity.email,
                firstName: input.acceptedIdentity.firstName,
                lastName: input.acceptedIdentity.lastName,
              });
            const existing =
              current.associatesByBusinessUnit.get(input.businessUnitId) ?? [];
            const existingAssociate = existing.find(
              (associate) =>
                associate.authUserId === input.acceptedIdentity.authUserId
            );

            if (existingAssociate) {
              return existingAssociate;
            }

            const membership = new CommerceAssociateMembership({
              businessUnitId: input.businessUnitId,
              customerId: customer.customerId,
              authUserId: input.acceptedIdentity.authUserId,
              role: input.role,
            });

            yield* Ref.update(state, (latest) => ({
              ...latest,
              customersByAuthUserId: new Map(latest.customersByAuthUserId).set(
                input.acceptedIdentity.authUserId,
                customer
              ),
              associatesByBusinessUnit: new Map(
                latest.associatesByBusinessUnit
              ).set(input.businessUnitId, [...existing, membership]),
            }));

            return membership;
          })
      );

      return {
        createFromRegistration,
        linkRegistrantIdentity,
        addAssociate,
      };
    })
  );
}
