import type {
  AssociateDraft,
  BusinessUnit,
  BusinessUnitDraft,
  BusinessUnitUpdateAction,
  ByProjectKeyRequestBuilder,
  Customer,
  CustomerDraft,
  CustomerUpdateAction,
} from "@commercetools/platform-sdk";
import { AddressBookReference } from "@repo/commerce/domain/address-book";
import {
  CommerceAccount,
  CommerceAssociateMembership,
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceBusinessUnitLabel,
  CommerceBusinessUnitMembership,
  type CommerceCompanyRole,
  CommerceCustomerId,
  CommerceCustomerProfile,
} from "@repo/commerce/domain/commerce-account";
import type { AuthUserId } from "@repo/commerce/domain/commerce-request-context";
import {
  type AcceptedCommerceIdentity,
  CommerceAccountUnavailable,
  type CommerceAccountRegistrationInput,
  CommerceAccounts,
  CommerceCustomerIdNotFound,
  CommerceCustomerProfileNotFound,
  type RedactedString,
} from "@repo/commerce/services/commerce-accounts";
import type { StoreKey } from "@repo/commerce/store";
import { Effect, Layer, Redacted, Schema } from "effect";

import { toCommercetoolsAddressKey } from "../address-book/address-book-key";
import { commercetoolsClientsLayer } from "../client/layers";
import { CommercetoolsRestClient } from "../client/rest-client";
import {
  commercetoolsProviderFailureReason,
  CommercetoolsRequestFailure,
  commercetoolsFailureCause,
  commercetoolsRequest,
  RetryVersionedWrite,
  retryVersionedWrite,
} from "../client/versioned-write";

const NOT_FOUND_STATUS_CODE = 404;

const CommercetoolsStatusCodeError = Schema.Struct({
  statusCode: Schema.Number,
});

const isNotFoundError = (error: unknown) =>
  Schema.decodeUnknownOption(CommercetoolsStatusCodeError)(
    commercetoolsFailureCause(error)
  ).pipe(
    (option) =>
      option._tag === "Some" &&
      option.value.statusCode === NOT_FOUND_STATUS_CODE
  );

const failAccountRequest = (message: string, cause: unknown) =>
  commercetoolsProviderFailureReason(cause) === "unavailable"
    ? Effect.fail(new CommerceAccountUnavailable({ cause, message }))
    : Effect.die(new Error(message, { cause }));

interface CommercetoolsAccountRequestFailure {
  readonly _tag: "CommercetoolsAccountRequestFailure";
  readonly cause: unknown;
  readonly message: string;
}

const commerceAccountRequest = <A>(
  message: string,
  request: () => Promise<A>
) =>
  Effect.tryPromise({
    try: request,
    catch: (cause): CommercetoolsAccountRequestFailure => ({
      _tag: "CommercetoolsAccountRequestFailure",
      cause,
      message,
    }),
  }).pipe(
    Effect.catchTag("CommercetoolsAccountRequestFailure", (failure) =>
      failAccountRequest(failure.message, failure.cause)
    )
  );

const customerKey = (registration: CommerceAccountRegistrationInput) =>
  `registration-customer-${registration.id}`;

const businessUnitKey = (registration: CommerceAccountRegistrationInput) =>
  `registration-business-unit-${registration.id}`;

const COMMERCETOOLS_ASSOCIATE_ROLE_KEYS = {
  associate: ["buyer"],
  owner: ["admin", "buyer"],
} as const satisfies Record<CommerceCompanyRole, readonly string[]>;

const associateRoleKeys = (role: CommerceCompanyRole) =>
  COMMERCETOOLS_ASSOCIATE_ROLE_KEYS[role];

const customerKeyFromAcceptedIdentity = (identity: AcceptedCommerceIdentity) =>
  `auth-customer-${authUserId(identity)}`;

const authUserId = (identity: AcceptedCommerceIdentity) =>
  String(identity.authUserId);

const customerEmail = (identity: AcceptedCommerceIdentity) =>
  Redacted.value(identity.email);

const customerFirstName = (identity: AcceptedCommerceIdentity) =>
  Redacted.value(identity.firstName);

const customerLastName = (identity: AcceptedCommerceIdentity) =>
  Redacted.value(identity.lastName);

const registrationStore = (registration: CommerceAccountRegistrationInput) => ({
  typeId: "store" as const,
  key: String(registration.storeKey),
});

const makeCommerceAccounts = (apiRoot: ByProjectKeyRequestBuilder) => {
  const getCustomerByKey = (key: string) =>
    Effect.tryPromise({
      try: async () => {
        const response = await apiRoot
          .customers()
          .withKey({ key })
          .get()
          .execute();
        return response.body;
      },
      catch: (cause) =>
        new CommercetoolsRequestFailure({
          message: "Failed to read Commercetools customer by key",
          cause,
        }),
    }).pipe(
      Effect.catch((failure) =>
        isNotFoundError(failure)
          ? Effect.succeed(null)
          : failAccountRequest(
              "Failed to read Commercetools customer",
              commercetoolsFailureCause(failure)
            )
      )
    );

  const getBusinessUnitByKey = (key: string) =>
    Effect.tryPromise({
      try: async () => {
        const response = await apiRoot
          .businessUnits()
          .withKey({ key })
          .get()
          .execute();
        return response.body;
      },
      catch: (cause) =>
        new CommercetoolsRequestFailure({
          message: "Failed to read Commercetools business unit by key",
          cause,
        }),
    }).pipe(
      Effect.catch((failure) =>
        isNotFoundError(failure)
          ? Effect.succeed(null)
          : failAccountRequest(
              "Failed to read Commercetools business unit",
              commercetoolsFailureCause(failure)
            )
      )
    );

  const getCustomerById = (commerceCustomerId: CommerceCustomerId) =>
    commerceAccountRequest(
      "Failed to read Commercetools customer",
      async () => {
        const response = await apiRoot
          .customers()
          .withId({ ID: String(commerceCustomerId) })
          .get()
          .execute();
        return response.body;
      }
    );

  const queryFirstCustomer = (where: string) =>
    commerceAccountRequest(
      "Failed to query Commercetools customer",
      async () => {
        const response = await apiRoot
          .customers()
          .get({ queryArgs: { where, limit: 1 } })
          .execute();

        return response.body.results[0] ?? null;
      }
    );

  const getCustomerByAcceptedIdentity = (identity: AcceptedCommerceIdentity) =>
    queryFirstCustomer(
      `externalId = ${JSON.stringify(authUserId(identity))} or email = ${JSON.stringify(customerEmail(identity))}`
    );

  const getCustomerIdByAuthUserId = Effect.fn(
    "CommercetoolsCommerceAccounts.getCustomerIdByAuthUserId"
  )(function* (input: AuthUserId) {
    const customer = yield* queryFirstCustomer(
      `externalId = ${JSON.stringify(String(input))}`
    );

    if (!customer) {
      return yield* new CommerceCustomerIdNotFound({
        message: "Commerce customer id does not exist for auth user",
        authUserId: input,
      });
    }

    return toCommerceCustomerId(customer);
  });

  const getCustomerProfile = Effect.fn(
    "CommercetoolsCommerceAccounts.getCustomerProfile"
  )(function* (customerId: CommerceCustomerId) {
    const customer = yield* Effect.tryPromise({
      try: async () => {
        const response = await apiRoot
          .customers()
          .withId({ ID: String(customerId) })
          .get()
          .execute();
        return response.body;
      },
      catch: (cause) =>
        new CommercetoolsRequestFailure({
          message: "Failed to read Commercetools customer profile",
          cause,
        }),
    }).pipe(
      Effect.catch(
        (
          failure
        ): Effect.Effect<
          never,
          CommerceAccountUnavailable | CommerceCustomerProfileNotFound
        > =>
          isNotFoundError(failure)
            ? Effect.fail(
                new CommerceCustomerProfileNotFound({
                  message: "Commerce customer profile does not exist",
                  customerId,
                })
              )
            : failAccountRequest(
                "Failed to read Commercetools customer profile",
                commercetoolsFailureCause(failure)
              )
      )
    );

    return new CommerceCustomerProfile({
      customerId,
      email: Redacted.make(customer.email, { label: "email" }),
      ...(customer.firstName === undefined
        ? {}
        : {
            firstName: Redacted.make(customer.firstName, {
              label: "personName",
            }),
          }),
      ...(customer.lastName === undefined
        ? {}
        : {
            lastName: Redacted.make(customer.lastName, {
              label: "personName",
            }),
          }),
    });
  });

  const businessUnitForCustomerPredicate = (customerId: CommerceCustomerId) =>
    `associates(customer(id=${JSON.stringify(String(customerId))})) or inheritedAssociates(customer(id=${JSON.stringify(String(customerId))}))`;

  const BUSINESS_UNIT_PAGE_SIZE = 500;

  const listBusinessUnitMembershipsForCustomerInStore = Effect.fn(
    "CommercetoolsCommerceAccounts.listBusinessUnitMembershipsForCustomerInStore"
  )(function* (customerId: CommerceCustomerId, storeKey: StoreKey) {
    const businessUnits = yield* commerceAccountRequest(
      "Failed to list Commercetools Business Unit memberships",
      async () => {
        const results: BusinessUnit[] = [];
        let offset = 0;

        while (true) {
          const response = await apiRoot
            .inStoreKeyWithStoreKeyValue({ storeKey: String(storeKey) })
            .businessUnits()
            .get({
              queryArgs: {
                where: businessUnitForCustomerPredicate(customerId),
                limit: BUSINESS_UNIT_PAGE_SIZE,
                offset,
                sort: "id asc",
              },
            })
            .execute();
          const page = response.body.results;
          results.push(...page);

          if (page.length < BUSINESS_UNIT_PAGE_SIZE) {
            return results;
          }
          offset += page.length;
        }
      }
    );

    return businessUnits.map(
      (businessUnit) =>
        new CommerceBusinessUnitMembership({
          businessUnitId: CommerceBusinessUnitId.make(businessUnit.id),
          businessUnitKey: CommerceBusinessUnitKey.make(businessUnit.key),
          businessUnitLabel: CommerceBusinessUnitLabel.make(businessUnit.name),
        })
    );
  });

  const getBusinessUnitById = (
    commerceBusinessUnitId: CommerceBusinessUnitId
  ) =>
    commerceAccountRequest(
      "Failed to read Commercetools business unit",
      async () => {
        const response = await apiRoot
          .businessUnits()
          .withId({ ID: String(commerceBusinessUnitId) })
          .get()
          .execute();
        return response.body;
      }
    );

  const toCustomerDraft = (
    registration: CommerceAccountRegistrationInput,
    key: string
  ): CustomerDraft => {
    const details = registration.details;

    return {
      key,
      authenticationMode: "ExternalAuth",
      email: Redacted.value(details.email),
      firstName: Redacted.value(details.contactFirstName),
      lastName: Redacted.value(details.contactLastName),
      companyName: String(details.companyName),
      ...(details.vatId ? { vatId: Redacted.value(details.vatId) } : {}),
      isEmailVerified: true,
    };
  };

  const toBusinessUnitDraft = (
    registration: CommerceAccountRegistrationInput,
    key: string
  ): BusinessUnitDraft => {
    const details = registration.details;

    return {
      key,
      unitType: "Company",
      status: "Active",
      name: String(details.companyName),
      contactEmail: Redacted.value(details.email),
      addresses: [
        {
          key: toCommercetoolsAddressKey(
            AddressBookReference.make(`registration-${registration.id}`)
          ),
          streetName: Redacted.value(details.address.streetName),
          additionalStreetInfo: details.address.additionalStreetInfo
            ? Redacted.value(details.address.additionalStreetInfo)
            : undefined,
          postalCode: Redacted.value(details.address.postalCode),
          city: Redacted.value(details.address.city),
          region: details.address.region
            ? Redacted.value(details.address.region)
            : undefined,
          country: String(details.address.country),
          firstName: Redacted.value(details.contactFirstName),
          lastName: Redacted.value(details.contactLastName),
          company: String(details.companyName),
          phone: details.companyPhone
            ? Redacted.value(details.companyPhone)
            : undefined,
        },
      ],
      billingAddresses: [0],
      shippingAddresses: [0],
      defaultBillingAddress: 0,
      defaultShippingAddress: 0,
      storeMode: "Explicit",
      stores: [registrationStore(registration)],
    };
  };

  const createCustomer = (
    registration: CommerceAccountRegistrationInput,
    key: string
  ) =>
    commerceAccountRequest(
      "Failed to create Commercetools customer",
      async () => {
        const response = await apiRoot
          .customers()
          .post({ body: toCustomerDraft(registration, key) })
          .execute();

        return response.body.customer;
      }
    );

  const createCustomerFromAcceptedIdentity = (
    identity: AcceptedCommerceIdentity
  ) =>
    commerceAccountRequest(
      "Failed to create Commercetools customer",
      async () => {
        const response = await apiRoot
          .customers()
          .post({
            body: {
              key: customerKeyFromAcceptedIdentity(identity),
              authenticationMode: "ExternalAuth",
              externalId: authUserId(identity),
              email: customerEmail(identity),
              firstName: customerFirstName(identity),
              lastName: customerLastName(identity),
              isEmailVerified: true,
            },
          })
          .execute();

        return response.body.customer;
      }
    );

  const createBusinessUnit = (
    registration: CommerceAccountRegistrationInput,
    key: string
  ) =>
    commerceAccountRequest(
      "Failed to create Commercetools business unit",
      async () => {
        const response = await apiRoot
          .businessUnits()
          .post({ body: toBusinessUnitDraft(registration, key) })
          .execute();

        return response.body;
      }
    );

  const ensureBusinessUnitStore = (
    businessUnit: BusinessUnit,
    registration: CommerceAccountRegistrationInput
  ): Effect.Effect<BusinessUnit, CommerceAccountUnavailable> => {
    const store = registrationStore(registration);

    const attempt = (current: BusinessUnit) => {
      if (
        current.stores?.length === 1 &&
        current.stores[0]?.key === store.key
      ) {
        return Effect.succeed(current);
      }

      return commercetoolsRequest(
        "Failed to associate Commercetools business unit with Store",
        async () => {
          const response = await apiRoot
            .businessUnits()
            .withId({ ID: current.id })
            .post({
              body: {
                version: current.version,
                actions: [
                  {
                    action: "setStores",
                    stores: [store],
                  },
                ],
              },
            })
            .execute();

          return response.body;
        }
      );
    };

    return retryVersionedWrite({
      operation: "commerceAccount.businessUnit.ensureStore",
      input: businessUnit,
      attempt,
      resolveConflict: () =>
        getBusinessUnitById(CommerceBusinessUnitId.make(businessUnit.id)).pipe(
          Effect.map((current) => new RetryVersionedWrite(current))
        ),
    }).pipe(
      Effect.catch((failure) =>
        failure instanceof CommerceAccountUnavailable
          ? Effect.fail(failure)
          : failAccountRequest(
              "Failed to associate Commercetools business unit with Store",
              commercetoolsFailureCause(failure)
            )
      )
    );
  };

  const toCommerceCustomerId = (customer: Customer) =>
    CommerceCustomerId.make(customer.id);

  const toCommerceBusinessUnitId = (businessUnit: BusinessUnit) =>
    CommerceBusinessUnitId.make(businessUnit.id);

  const syncCustomerIdentity = (
    customer: Customer,
    input: {
      readonly acceptedIdentity: AcceptedCommerceIdentity;
    }
  ) => {
    const attempt = (current: Customer) => {
      const actions: CustomerUpdateAction[] = [];
      const email = Redacted.value(input.acceptedIdentity.email);
      const firstName = Redacted.value(input.acceptedIdentity.firstName);
      const lastName = Redacted.value(input.acceptedIdentity.lastName);
      const externalId = authUserId(input.acceptedIdentity);

      if (current.externalId !== externalId) {
        actions.push({ action: "setExternalId", externalId });
      }
      if (current.email !== email) {
        actions.push({ action: "changeEmail", email });
      }
      if (current.firstName !== firstName) {
        actions.push({ action: "setFirstName", firstName });
      }
      if (current.lastName !== lastName) {
        actions.push({ action: "setLastName", lastName });
      }

      if (actions.length === 0) {
        return Effect.succeed(current);
      }

      return commercetoolsRequest(
        "Failed to sync Commercetools customer identity",
        async () => {
          const response = await apiRoot
            .customers()
            .withId({ ID: current.id })
            .post({
              body: {
                version: current.version,
                actions,
              },
            })
            .execute();

          return response.body;
        }
      );
    };

    return retryVersionedWrite({
      operation: "commerceAccount.customer.syncIdentity",
      input: customer,
      attempt,
      resolveConflict: () =>
        getCustomerById(CommerceCustomerId.make(customer.id)).pipe(
          Effect.map((current) => new RetryVersionedWrite(current))
        ),
    }).pipe(
      Effect.catch((failure) =>
        failure instanceof CommerceAccountUnavailable
          ? Effect.fail(failure)
          : failAccountRequest(
              "Failed to sync Commercetools customer identity",
              commercetoolsFailureCause(failure)
            )
      )
    );
  };

  const ensureAcceptedIdentityCustomer = (identity: AcceptedCommerceIdentity) =>
    Effect.gen(function* () {
      const existing =
        (yield* getCustomerByAcceptedIdentity(identity)) ??
        (yield* createCustomerFromAcceptedIdentity(identity));

      return yield* syncCustomerIdentity(existing, {
        acceptedIdentity: identity,
      });
    });

  const associateDraft = (
    customer: Customer,
    role: CommerceCompanyRole
  ): AssociateDraft => ({
    customer: { typeId: "customer", id: customer.id },
    associateRoleAssignments: associateRoleKeys(role).map((key) => ({
      associateRole: {
        typeId: "associate-role",
        key,
      },
      inheritance: "Enabled",
    })),
  });

  const hasAssociateRoles = (
    businessUnit: BusinessUnit,
    customer: Customer,
    role: CommerceCompanyRole
  ) => {
    const associate = businessUnit.associates?.find(
      (candidate) => candidate.customer.id === customer.id
    );
    if (!associate) {
      return false;
    }

    return associateRoleKeys(role).every((roleKey) =>
      associate.associateRoleAssignments.some(
        (assignment) => assignment.associateRole.key === roleKey
      )
    );
  };

  const ensureBusinessUnitAssociate = (input: {
    readonly businessUnit: BusinessUnit;
    readonly customer: Customer;
    readonly role: CommerceCompanyRole;
  }) => {
    const attempt = (current: typeof input) => {
      if (
        hasAssociateRoles(current.businessUnit, current.customer, current.role)
      ) {
        return Effect.succeed(current.businessUnit);
      }

      const existingAssociate = current.businessUnit.associates?.find(
        (associate) => associate.customer.id === current.customer.id
      );
      const action: BusinessUnitUpdateAction = existingAssociate
        ? {
            action: "changeAssociate",
            associate: associateDraft(current.customer, current.role),
          }
        : {
            action: "addAssociate",
            associate: associateDraft(current.customer, current.role),
          };

      return commercetoolsRequest(
        "Failed to add Commercetools business unit associate",
        async () => {
          const response = await apiRoot
            .businessUnits()
            .withId({ ID: current.businessUnit.id })
            .post({
              body: {
                version: current.businessUnit.version,
                actions: [action],
              },
            })
            .execute();

          return response.body;
        }
      );
    };

    return retryVersionedWrite({
      operation: "commerceAccount.businessUnit.ensureAssociate",
      input,
      attempt,
      resolveConflict: () =>
        getBusinessUnitById(
          CommerceBusinessUnitId.make(input.businessUnit.id)
        ).pipe(
          Effect.map(
            (businessUnit) =>
              new RetryVersionedWrite({
                ...input,
                businessUnit,
              })
          )
        ),
    }).pipe(
      Effect.catch((failure) =>
        failure instanceof CommerceAccountUnavailable
          ? Effect.fail(failure)
          : failAccountRequest(
              "Failed to add Commercetools business unit associate",
              commercetoolsFailureCause(failure)
            )
      )
    );
  };

  const hasCustomerWithEmail = Effect.fn(
    "CommercetoolsCommerceAccounts.hasCustomerWithEmail"
  )((email: RedactedString) =>
    commerceAccountRequest(
      "Failed to check Commercetools customer email",
      async () => {
        const response = await apiRoot
          .customers()
          .get({
            queryArgs: {
              where: "email = :email",
              "var.email": Redacted.value(email),
              limit: 1,
            },
          })
          .execute();

        return response.body.results.length > 0;
      }
    )
  );

  return CommerceAccounts.of({
    hasCustomerWithEmail,
    getCustomerIdByAuthUserId,
    getCustomerProfile,
    listBusinessUnitMembershipsForCustomerInStore,
    createFromRegistration: Effect.fn(
      "CommercetoolsCommerceAccounts.createFromRegistration"
    )(function* (registration) {
      if (registration._tag === "RejectedRegistration") {
        return yield* Effect.die(
          new Error("Cannot provision commerce for a rejected registration")
        );
      }

      const cKey = customerKey(registration);
      const buKey = businessUnitKey(registration);
      const customer =
        (yield* getCustomerByKey(cKey)) ??
        (yield* createCustomer(registration, cKey));
      const existingBusinessUnit = yield* getBusinessUnitByKey(buKey);
      const businessUnit = existingBusinessUnit
        ? yield* ensureBusinessUnitStore(existingBusinessUnit, registration)
        : yield* createBusinessUnit(registration, buKey);

      return new CommerceAccount({
        registrationId: registration.id,
        customerId: toCommerceCustomerId(customer),
        businessUnitId: toCommerceBusinessUnitId(businessUnit),
      });
    }),
    linkRegistrantIdentity: Effect.fn(
      "CommercetoolsCommerceAccounts.linkRegistrantIdentity"
    )(function* (input) {
      const customer = yield* getCustomerById(
        input.registration.commerceAccount.customerId
      );

      const linkedCustomer = yield* syncCustomerIdentity(customer, {
        acceptedIdentity: input.acceptedIdentity,
      });
      const businessUnit = yield* getBusinessUnitById(
        input.registration.commerceAccount.businessUnitId
      );

      yield* ensureBusinessUnitAssociate({
        businessUnit,
        customer: linkedCustomer,
        role: "owner",
      });

      return input.registration.commerceAccount;
    }),
    addAssociate: Effect.fn("CommercetoolsCommerceAccounts.addAssociate")(
      function* (input) {
        const customer = yield* ensureAcceptedIdentityCustomer(
          input.acceptedIdentity
        );
        const businessUnit = yield* getBusinessUnitById(input.businessUnitId);

        yield* ensureBusinessUnitAssociate({
          businessUnit,
          customer,
          role: input.role,
        });

        return new CommerceAssociateMembership({
          businessUnitId: input.businessUnitId,
          customerId: toCommerceCustomerId(customer),
          authUserId: input.acceptedIdentity.authUserId,
          role: input.role,
        });
      }
    ),
  });
};

export const commerceAccountsLayerFrom = (
  apiRoot: ByProjectKeyRequestBuilder
) => Layer.succeed(CommerceAccounts, makeCommerceAccounts(apiRoot));

const commerceAccountsImplementationLayer = Layer.effect(
  CommerceAccounts,
  Effect.gen(function* () {
    const { apiRoot } = yield* CommercetoolsRestClient;
    return makeCommerceAccounts(apiRoot);
  })
);

export const commerceAccountsLayer = commerceAccountsImplementationLayer.pipe(
  Layer.provide(commercetoolsClientsLayer)
);
