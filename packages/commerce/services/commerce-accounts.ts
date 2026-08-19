import { Context, Effect, Layer, Redacted, Ref, Schema } from "effect";

import {
  CommerceAccount,
  CommerceAssociateMembership,
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceBusinessUnitLabel,
  CommerceBusinessUnitMembership,
  CommerceCustomer,
  CommerceCustomerId,
  CommerceCustomerProfile,
} from "../domain/commerce-account";
import type { CommerceCompanyRole } from "../domain/commerce-account";
import { AuthUserId } from "../domain/commerce-request-context";
import type { StoreKey } from "../store";

type RegistrationLikeTag =
  | "AwaitingApprovalRegistration"
  | "ApprovalProcessingRegistration"
  | "ApprovedRegistration"
  | "RejectedRegistration";

export type RedactedString = Redacted.Redacted;

export interface CommerceAccountRegistrationInput {
  readonly _tag: RegistrationLikeTag;
  readonly id: string;
  readonly storeKey: StoreKey;
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

export class CommerceAccountUnavailable extends Schema.TaggedErrorClass<CommerceAccountUnavailable>()(
  "CommerceAccountUnavailable",
  {
    cause: Schema.optional(Schema.Defect),
    message: Schema.String,
  }
) {}

export class CommerceCustomerIdNotFound extends Schema.TaggedErrorClass<CommerceCustomerIdNotFound>()(
  "CommerceCustomerIdNotFound",
  {
    authUserId: AuthUserId,
    message: Schema.String,
  }
) {}

export class CommerceCustomerProfileNotFound extends Schema.TaggedErrorClass<CommerceCustomerProfileNotFound>()(
  "CommerceCustomerProfileNotFound",
  {
    customerId: CommerceCustomerId,
    message: Schema.String,
  }
) {}

export interface CommerceAccountsMemoryInput {
  readonly customerProfiles?: readonly CommerceCustomerProfile[];
  readonly customers?: readonly {
    readonly authUserId: AuthUserId;
    readonly customerId: CommerceCustomerId;
  }[];
  readonly businessUnitMemberships?: readonly {
    readonly customerId: CommerceCustomerId;
    readonly storeKey: StoreKey;
    readonly membership: CommerceBusinessUnitMembership;
  }[];
}

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
  readonly storeKeysByRegistration: ReadonlyMap<string, StoreKey>;
  readonly businessUnitLabels: ReadonlyMap<
    CommerceBusinessUnitId,
    CommerceBusinessUnitLabel
  >;
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
  associatesByBusinessUnit: new Map(),
  businessUnitLabels: new Map(),
  customersByAuthUserId: new Map(),
  linkedRegistrantIdentities: new Map(),
  storeKeysByRegistration: new Map(),
};

export class CommerceAccounts extends Context.Service<
  CommerceAccounts,
  {
    readonly createFromRegistration: (
      registration: CommerceAccountRegistrationInput
    ) => Effect.Effect<CommerceAccount, CommerceAccountUnavailable>;
    readonly linkRegistrantIdentity: (
      input: LinkRegistrantIdentityInput
    ) => Effect.Effect<CommerceAccount, CommerceAccountUnavailable>;
    readonly addAssociate: (
      input: AddAssociateInput
    ) => Effect.Effect<CommerceAssociateMembership, CommerceAccountUnavailable>;
    readonly hasCustomerWithEmail: (
      email: RedactedString
    ) => Effect.Effect<boolean, CommerceAccountUnavailable>;
    readonly getCustomerIdByAuthUserId: (
      authUserId: AuthUserId
    ) => Effect.Effect<
      CommerceCustomerId,
      CommerceCustomerIdNotFound | CommerceAccountUnavailable
    >;
    readonly getCustomerProfile: (
      customerId: CommerceCustomerId
    ) => Effect.Effect<
      CommerceCustomerProfile,
      CommerceCustomerProfileNotFound | CommerceAccountUnavailable
    >;
    readonly listBusinessUnitMembershipsForCustomerInStore: (
      customerId: CommerceCustomerId,
      storeKey: StoreKey
    ) => Effect.Effect<
      readonly CommerceBusinessUnitMembership[],
      CommerceAccountUnavailable
    >;
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
            return yield* Effect.die(
              new Error("Cannot provision commerce for a rejected registration")
            );
          }

          const account = new CommerceAccount({
            businessUnitId: CommerceBusinessUnitId.make(
              `business-unit-${registration.id}`
            ),
            customerId: CommerceCustomerId.make(`customer-${registration.id}`),
            registrationId: registration.id,
          });

          yield* Ref.update(state, (latest) => ({
            ...latest,
            accountsByRegistration: new Map(latest.accountsByRegistration).set(
              registration.id,
              account
            ),
            businessUnitLabels: new Map(latest.businessUnitLabels).set(
              account.businessUnitId,
              CommerceBusinessUnitLabel.make(registration.details.companyName)
            ),
            storeKeysByRegistration: new Map(
              latest.storeKeysByRegistration
            ).set(registration.id, registration.storeKey),
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
            return yield* Effect.die(
              new Error("Commerce account does not exist for registration")
            );
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
              return yield* Effect.die(
                new Error("Commerce account does not exist for business unit")
              );
            }

            const customer =
              current.customersByAuthUserId.get(
                input.acceptedIdentity.authUserId
              ) ??
              new CommerceCustomer({
                authUserId: input.acceptedIdentity.authUserId,
                customerId: CommerceCustomerId.make(
                  `customer-${input.acceptedIdentity.authUserId}`
                ),
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
              authUserId: input.acceptedIdentity.authUserId,
              businessUnitId: input.businessUnitId,
              customerId: customer.customerId,
              role: input.role,
            });

            yield* Ref.update(state, (latest) => ({
              ...latest,
              associatesByBusinessUnit: new Map(
                latest.associatesByBusinessUnit
              ).set(input.businessUnitId, [...existing, membership]),
              customersByAuthUserId: new Map(latest.customersByAuthUserId).set(
                input.acceptedIdentity.authUserId,
                customer
              ),
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

      const getCustomerIdByAuthUserId = Effect.fn(
        "CommerceAccounts.getCustomerIdByAuthUserId"
      )((authUserId: AuthUserId) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(state);
          const customer = current.customersByAuthUserId.get(
            String(authUserId)
          );
          if (customer) {
            return customer.customerId;
          }

          for (const [
            registrationId,
            identity,
          ] of current.linkedRegistrantIdentities) {
            if (identity.authUserId === String(authUserId)) {
              const account =
                current.accountsByRegistration.get(registrationId);
              if (account) {
                return account.customerId;
              }
            }
          }

          return yield* new CommerceCustomerIdNotFound({
            authUserId,
            message: "Commerce customer id does not exist for auth user",
          });
        })
      );

      const getCustomerProfile = Effect.fn(
        "CommerceAccounts.getCustomerProfile"
      )((customerId: CommerceCustomerId) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(state);
          const customer = [...current.customersByAuthUserId.values()].find(
            (candidate) => candidate.customerId === customerId
          );

          if (customer) {
            return new CommerceCustomerProfile({
              customerId: customer.customerId,
              email: customer.email,
              firstName: customer.firstName,
              lastName: customer.lastName,
            });
          }

          for (const [
            registrationId,
            identity,
          ] of current.linkedRegistrantIdentities) {
            const account = current.accountsByRegistration.get(registrationId);
            if (account?.customerId === customerId) {
              return new CommerceCustomerProfile({
                customerId,
                email: identity.email,
                firstName: identity.firstName,
                lastName: identity.lastName,
              });
            }
          }

          return yield* new CommerceCustomerProfileNotFound({
            customerId,
            message: "Commerce customer profile does not exist",
          });
        })
      );

      const listBusinessUnitMembershipsForCustomerInStore = Effect.fn(
        "CommerceAccounts.listBusinessUnitMembershipsForCustomerInStore"
      )((customerId: CommerceCustomerId, storeKey: StoreKey) =>
        Effect.gen(function* () {
          const current = yield* Ref.get(state);
          const businessUnitIds = new Set<CommerceBusinessUnitId>();

          for (const [
            registrationId,
            candidateAccount,
          ] of current.accountsByRegistration) {
            const linkedIdentity =
              current.linkedRegistrantIdentities.get(registrationId);
            if (
              candidateAccount.customerId === customerId &&
              linkedIdentity !== undefined &&
              current.storeKeysByRegistration.get(registrationId) === storeKey
            ) {
              businessUnitIds.add(candidateAccount.businessUnitId);
            }
          }

          for (const [
            candidateBusinessUnitId,
            associates,
          ] of current.associatesByBusinessUnit) {
            const registrationEntry = [
              ...current.accountsByRegistration.entries(),
            ].find(
              ([, account]) =>
                account.businessUnitId === candidateBusinessUnitId
            );
            if (
              registrationEntry !== undefined &&
              current.storeKeysByRegistration.get(registrationEntry[0]) ===
                storeKey &&
              associates.some(
                (associate) => associate.customerId === customerId
              )
            ) {
              businessUnitIds.add(candidateBusinessUnitId);
            }
          }

          return [...businessUnitIds].flatMap((businessUnitId) => {
            const account = [...current.accountsByRegistration.values()].find(
              (candidate) => candidate.businessUnitId === businessUnitId
            );
            const businessUnitLabel =
              current.businessUnitLabels.get(businessUnitId);

            if (account === undefined || businessUnitLabel === undefined) {
              return [];
            }

            return [
              new CommerceBusinessUnitMembership({
                businessUnitId,
                businessUnitKey: CommerceBusinessUnitKey.make(
                  `registration-business-unit-${account.registrationId}`
                ),
                businessUnitLabel,
              }),
            ];
          });
        })
      );

      return {
        addAssociate,
        createFromRegistration,
        getCustomerIdByAuthUserId,
        getCustomerProfile,
        hasCustomerWithEmail,
        linkRegistrantIdentity,
        listBusinessUnitMembershipsForCustomerInStore,
      };
    })
  );

  static readonly layerMemoryFrom = ({
    customerProfiles = [],
    customers = [],
    businessUnitMemberships = [],
  }: CommerceAccountsMemoryInput = {}) => {
    const profilesByCustomerId = new Map(
      customerProfiles.map((profile) => [profile.customerId, profile])
    );
    const layerSeededAccounts = Layer.effect(
      CommerceAccounts,
      Effect.map(CommerceAccounts, (accounts) =>
        CommerceAccounts.of({
          ...accounts,
          getCustomerIdByAuthUserId: (authUserId) => {
            const customer = customers.find(
              (candidate) => candidate.authUserId === authUserId
            );
            return customer
              ? Effect.succeed(customer.customerId)
              : accounts.getCustomerIdByAuthUserId(authUserId);
          },
          getCustomerProfile: (customerId) => {
            const profile = profilesByCustomerId.get(customerId);
            return profile
              ? Effect.succeed(profile)
              : accounts.getCustomerProfile(customerId);
          },
          listBusinessUnitMembershipsForCustomerInStore: (
            customerId,
            storeKey
          ) => {
            const seeded = businessUnitMemberships
              .filter(
                (candidate) =>
                  candidate.customerId === customerId &&
                  candidate.storeKey === storeKey
              )
              .map(({ membership }) => membership);
            return seeded.length > 0
              ? Effect.succeed(seeded)
              : accounts.listBusinessUnitMembershipsForCustomerInStore(
                  customerId,
                  storeKey
                );
          },
        })
      )
    );

    return layerSeededAccounts.pipe(
      Layer.provide(CommerceAccounts.layerMemory)
    );
  };
}
