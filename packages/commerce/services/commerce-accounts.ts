import { Context, Effect, Layer, Redacted, Ref, Schema } from "effect";
import {
  CommerceAccount,
  CommerceAssociateMembership,
  CommerceBusinessUnitId,
  type CommerceCompanyRole,
  CommerceCustomer,
  CommerceCustomerId,
} from "../domain/commerce-account";

type RegistrationLikeTag =
  | "AwaitingApprovalRegistration"
  | "ApprovalProcessingRegistration"
  | "ApprovedRegistration"
  | "RejectedRegistration";

export type RedactedString = Redacted.Redacted<string>;

export interface CommerceAccountRegistrationInput {
  readonly _tag: RegistrationLikeTag;
  readonly id: string;
  readonly details: {
    readonly companyName: string;
    readonly companyPhone?: RedactedString | undefined;
    readonly vatId?: RedactedString | undefined;
    readonly contactFirstName: RedactedString;
    readonly contactLastName: RedactedString;
    readonly email: RedactedString;
    readonly address: {
      readonly streetName: RedactedString;
      readonly additionalStreetInfo?: RedactedString | undefined;
      readonly postalCode: RedactedString;
      readonly city: RedactedString;
      readonly region?: RedactedString | undefined;
      readonly country: string;
    };
  };
}

export interface AcceptedCommerceIdentity {
  readonly authUserId: string;
  readonly email: RedactedString;
  readonly firstName: RedactedString;
  readonly lastName: RedactedString;
}

export class CommerceAccountError extends Schema.TaggedErrorClass<CommerceAccountError>()(
  "CommerceAccountError",
  {
    message: Schema.String,
  }
) {}

export interface LinkRegistrantIdentityInput {
  readonly registration: {
    readonly id: string;
    readonly commerceAccount: CommerceAccount;
  };
  readonly acceptedIdentity: AcceptedCommerceIdentity;
}

export interface AddAssociateInput {
  readonly businessUnitId: CommerceBusinessUnitId;
  readonly acceptedIdentity: AcceptedCommerceIdentity;
  readonly role: Extract<CommerceCompanyRole, "associate">;
}

const normalizedEmail = (email: RedactedString) =>
  Redacted.value(email).trim().toLowerCase();

interface CommerceState {
  readonly accountsByRegistration: ReadonlyMap<string, CommerceAccount>;
  readonly customersByAuthUserId: ReadonlyMap<string, CommerceCustomer>;
  readonly linkedRegistrantIdentities: ReadonlyMap<
    string,
    AcceptedCommerceIdentity
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
      registration: CommerceAccountRegistrationInput
    ) => Effect.Effect<CommerceAccount, CommerceAccountError>;
    readonly linkRegistrantIdentity: (
      input: LinkRegistrantIdentityInput
    ) => Effect.Effect<CommerceAccount, CommerceAccountError>;
    readonly addAssociate: (
      input: AddAssociateInput
    ) => Effect.Effect<CommerceAssociateMembership, CommerceAccountError>;
    readonly hasCustomerWithEmail: (
      email: RedactedString
    ) => Effect.Effect<boolean, CommerceAccountError>;
  }
>()("@repo/commerce/CommerceAccounts") {
  static readonly layerMemory = Layer.effect(
    CommerceAccounts,
    Effect.gen(function* () {
      const state = yield* Ref.make<CommerceState>(initialState);

      const createFromRegistration = Effect.fn(
        "CommerceAccounts.createFromRegistration"
      )((registration: CommerceAccountRegistrationInput) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(state);
          const existing = current.accountsByRegistration.get(registration.id);
          if (existing) {
            return existing;
          }

          if (registration._tag === "RejectedRegistration") {
            return yield* new CommerceAccountError({
              message: "Cannot provision commerce for a rejected registration",
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
              message: "Commerce account does not exist for registration",
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
                message: "Commerce account does not exist for business unit",
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

      const hasCustomerWithEmail = Effect.fn(
        "CommerceAccounts.hasCustomerWithEmail"
      )((email: RedactedString) =>
        Ref.get(state).pipe(
          Effect.map((current) => {
            const targetEmail = normalizedEmail(email);

            return [...current.customersByAuthUserId.values()].some(
              (customer) => normalizedEmail(customer.email) === targetEmail
            );
          })
        )
      );

      return {
        createFromRegistration,
        linkRegistrantIdentity,
        addAssociate,
        hasCustomerWithEmail,
      };
    })
  );
}
