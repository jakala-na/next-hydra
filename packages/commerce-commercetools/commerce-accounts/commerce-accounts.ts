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
  CommerceCustomerId,
  CommerceCustomerProfile,
  CompanyRole,
  CompanyRoles,
  INITIAL_COMPANY_ROLES,
} from "@repo/commerce/domain/commerce-account";
import type { CompanyRoles as CompanyRolesType } from "@repo/commerce/domain/commerce-account";
import type { AuthUserId } from "@repo/commerce/domain/commerce-request-context";
import {
  CommerceAccountUnavailable,
  CommerceAccounts,
  CommerceCustomerIdNotFound,
  CommerceCustomerProfileNotFound,
} from "@repo/commerce/services/commerce-accounts";
import type {
  AcceptedCommerceIdentity,
  CommerceAccountRegistrationInput,
  RedactedString,
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
    catch: (cause): CommercetoolsAccountRequestFailure => ({
      _tag: "CommercetoolsAccountRequestFailure",
      cause,
      message,
    }),
    try: request,
  }).pipe(
    Effect.catchTag("CommercetoolsAccountRequestFailure", (failure) =>
      failAccountRequest(failure.message, failure.cause)
    )
  );

const customerKey = (registration: CommerceAccountRegistrationInput) =>
  `registration-customer-${registration.id}`;

const businessUnitKey = (registration: CommerceAccountRegistrationInput) =>
  `registration-business-unit-${registration.id}`;

const companyRolesForCustomer = (
  businessUnit: BusinessUnit,
  customerId: CommerceCustomerId
): CompanyRolesType => {
  const customer = customerId;
  const directRoleKeys = (businessUnit.associates ?? [])
    .filter((associate) => associate.customer.id === customer)
    .flatMap((associate) =>
      associate.associateRoleAssignments.map(
        (assignment) => assignment.associateRole.key
      )
    );
  const inheritedRoleKeys = (businessUnit.inheritedAssociates ?? [])
    .filter((associate) => associate.customer.id === customer)
    .flatMap((associate) =>
      associate.associateRoleAssignments.map(
        (assignment) => assignment.associateRole.key
      )
    );

  return Schema.decodeUnknownSync(CompanyRoles)(
    [...new Set([...directRoleKeys, ...inheritedRoleKeys])].filter(
      Schema.is(CompanyRole)
    )
  );
};

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
  key: String(registration.storeKey),
  typeId: "store" as const,
});

const makeCommerceAccounts = (apiRoot: ByProjectKeyRequestBuilder) => {
  const getCustomerByKey = (key: string) =>
    Effect.tryPromise({
      catch: (cause) =>
        new CommercetoolsRequestFailure({
          cause,
          message: "Failed to read Commercetools customer by key",
        }),
      try: async () => {
        const response = await apiRoot
          .customers()
          .withKey({ key })
          .get()
          .execute();
        return response.body;
      },
    }).pipe(
      Effect.catch((error) =>
        isNotFoundError(error)
          ? Effect.succeed(null)
          : failAccountRequest(
              "Failed to read Commercetools customer",
              commercetoolsFailureCause(error)
            )
      )
    );

  const getBusinessUnitByKey = (key: string) =>
    Effect.tryPromise({
      catch: (cause) =>
        new CommercetoolsRequestFailure({
          cause,
          message: "Failed to read Commercetools business unit by key",
        }),
      try: async () => {
        const response = await apiRoot
          .businessUnits()
          .withKey({ key })
          .get()
          .execute();
        return response.body;
      },
    }).pipe(
      Effect.catch((error) =>
        isNotFoundError(error)
          ? Effect.succeed(null)
          : failAccountRequest(
              "Failed to read Commercetools business unit",
              commercetoolsFailureCause(error)
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
          .get({ queryArgs: { limit: 1, where } })
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
        authUserId: input,
        message: "Commerce customer id does not exist for auth user",
      });
    }

    return toCommerceCustomerId(customer);
  });

  const getCustomerProfile = Effect.fn(
    "CommercetoolsCommerceAccounts.getCustomerProfile"
  )(function* (customerId: CommerceCustomerId) {
    const customer = yield* Effect.tryPromise({
      catch: (cause) =>
        new CommercetoolsRequestFailure({
          cause,
          message: "Failed to read Commercetools customer profile",
        }),
      try: async () => {
        const response = await apiRoot
          .customers()
          .withId({ ID: String(customerId) })
          .get()
          .execute();
        return response.body;
      },
    }).pipe(
      Effect.catch(
        (
          error
        ): Effect.Effect<
          never,
          CommerceAccountUnavailable | CommerceCustomerProfileNotFound
        > =>
          isNotFoundError(error)
            ? Effect.fail(
                new CommerceCustomerProfileNotFound({
                  customerId,
                  message: "Commerce customer profile does not exist",
                })
              )
            : failAccountRequest(
                "Failed to read Commercetools customer profile",
                commercetoolsFailureCause(error)
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
                limit: BUSINESS_UNIT_PAGE_SIZE,
                offset,
                sort: "id asc",
                where: businessUnitForCustomerPredicate(customerId),
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
          roles: companyRolesForCustomer(businessUnit, customerId),
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
    const { details } = registration;

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
    const { details } = registration;

    return {
      addresses: [
        {
          additionalStreetInfo: details.address.additionalStreetInfo
            ? Redacted.value(details.address.additionalStreetInfo)
            : undefined,
          city: Redacted.value(details.address.city),
          company: String(details.companyName),
          country: String(details.address.country),
          firstName: Redacted.value(details.contactFirstName),
          key: toCommercetoolsAddressKey(
            AddressBookReference.make(`registration-${registration.id}`)
          ),
          lastName: Redacted.value(details.contactLastName),
          phone: details.companyPhone
            ? Redacted.value(details.companyPhone)
            : undefined,
          postalCode: Redacted.value(details.address.postalCode),
          region: details.address.region
            ? Redacted.value(details.address.region)
            : undefined,
          streetName: Redacted.value(details.address.streetName),
        },
      ],
      billingAddresses: [0],
      contactEmail: Redacted.value(details.email),
      defaultBillingAddress: 0,
      defaultShippingAddress: 0,
      key,
      name: String(details.companyName),
      shippingAddresses: [0],
      status: "Active",
      storeMode: "Explicit",
      stores: [registrationStore(registration)],
      unitType: "Company",
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
              authenticationMode: "ExternalAuth",
              email: customerEmail(identity),
              externalId: authUserId(identity),
              firstName: customerFirstName(identity),
              isEmailVerified: true,
              key: customerKeyFromAcceptedIdentity(identity),
              lastName: customerLastName(identity),
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
                actions: [
                  {
                    action: "setStores",
                    stores: [store],
                  },
                ],
                version: current.version,
              },
            })
            .execute();

          return response.body;
        }
      );
    };

    return retryVersionedWrite({
      attempt,
      input: businessUnit,
      operation: "commerceAccount.businessUnit.ensureStore",
      resolveConflict: () =>
        getBusinessUnitById(CommerceBusinessUnitId.make(businessUnit.id)).pipe(
          Effect.map((current) => new RetryVersionedWrite(current))
        ),
    }).pipe(
      Effect.catch((error) =>
        error instanceof CommerceAccountUnavailable
          ? Effect.fail(error)
          : failAccountRequest(
              "Failed to associate Commercetools business unit with Store",
              commercetoolsFailureCause(error)
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
                actions,
                version: current.version,
              },
            })
            .execute();

          return response.body;
        }
      );
    };

    return retryVersionedWrite({
      attempt,
      input: customer,
      operation: "commerceAccount.customer.syncIdentity",
      resolveConflict: () =>
        getCustomerById(CommerceCustomerId.make(customer.id)).pipe(
          Effect.map((current) => new RetryVersionedWrite(current))
        ),
    }).pipe(
      Effect.catch((error) =>
        error instanceof CommerceAccountUnavailable
          ? Effect.fail(error)
          : failAccountRequest(
              "Failed to sync Commercetools customer identity",
              commercetoolsFailureCause(error)
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
    roleKeys: readonly string[]
  ): AssociateDraft => ({
    associateRoleAssignments: roleKeys.map((key) => ({
      associateRole: {
        key,
        typeId: "associate-role",
      },
      inheritance: "Enabled",
    })),
    customer: { id: customer.id, typeId: "customer" },
  });

  const hasAssociateRoles = (
    businessUnit: BusinessUnit,
    customer: Customer,
    roles: CompanyRolesType
  ) => {
    const associate = businessUnit.associates?.find(
      (candidate) => candidate.customer.id === customer.id
    );
    if (!associate) {
      return false;
    }

    return roles.every((roleKey) =>
      associate.associateRoleAssignments.some(
        (assignment) => assignment.associateRole.key === roleKey
      )
    );
  };

  const ensureBusinessUnitAssociate = (input: {
    readonly businessUnit: BusinessUnit;
    readonly customer: Customer;
    readonly roles: CompanyRolesType;
  }) => {
    const attempt = (current: typeof input) => {
      if (
        hasAssociateRoles(current.businessUnit, current.customer, current.roles)
      ) {
        return Effect.succeed(current.businessUnit);
      }

      const existingAssociate = current.businessUnit.associates?.find(
        (associate) => associate.customer.id === current.customer.id
      );
      const roleKeys = [
        ...new Set([
          ...(existingAssociate?.associateRoleAssignments.map(
            (assignment) => assignment.associateRole.key
          ) ?? []),
          ...current.roles,
        ]),
      ];
      const action: BusinessUnitUpdateAction = existingAssociate
        ? {
            action: "changeAssociate",
            associate: associateDraft(current.customer, roleKeys),
          }
        : {
            action: "addAssociate",
            associate: associateDraft(current.customer, roleKeys),
          };

      return commercetoolsRequest(
        "Failed to add Commercetools business unit associate",
        async () => {
          const response = await apiRoot
            .businessUnits()
            .withId({ ID: current.businessUnit.id })
            .post({
              body: {
                actions: [action],
                version: current.businessUnit.version,
              },
            })
            .execute();

          return response.body;
        }
      );
    };

    return retryVersionedWrite({
      attempt,
      input,
      operation: "commerceAccount.businessUnit.ensureAssociate",
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
      Effect.catch((error) =>
        error instanceof CommerceAccountUnavailable
          ? Effect.fail(error)
          : failAccountRequest(
              "Failed to add Commercetools business unit associate",
              commercetoolsFailureCause(error)
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
              limit: 1,
              "var.email": Redacted.value(email),
              where: "email = :email",
            },
          })
          .execute();

        return response.body.results.length > 0;
      }
    )
  );

  return CommerceAccounts.of({
    addAssociate: Effect.fn("CommercetoolsCommerceAccounts.addAssociate")(
      function* (input) {
        const customer = yield* ensureAcceptedIdentityCustomer(
          input.acceptedIdentity
        );
        const businessUnit = yield* getBusinessUnitById(input.businessUnitId);

        yield* ensureBusinessUnitAssociate({
          businessUnit,
          customer,
          roles: input.roles,
        });

        return new CommerceAssociateMembership({
          authUserId: input.acceptedIdentity.authUserId,
          businessUnitId: input.businessUnitId,
          customerId: toCommerceCustomerId(customer),
          roles: input.roles,
        });
      }
    ),
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
        businessUnitId: toCommerceBusinessUnitId(businessUnit),
        customerId: toCommerceCustomerId(customer),
        registrationId: registration.id,
      });
    }),
    getCustomerIdByAuthUserId,
    getCustomerProfile,
    hasCustomerWithEmail,
    linkRegistrantIdentity: Effect.fn(
      "CommercetoolsCommerceAccounts.linkRegistrantIdentity"
    )(function* (input) {
      const customer = yield* getCustomerById(input.commerceAccount.customerId);

      const linkedCustomer = yield* syncCustomerIdentity(customer, {
        acceptedIdentity: input.acceptedIdentity,
      });
      const businessUnit = yield* getBusinessUnitById(
        input.commerceAccount.businessUnitId
      );

      yield* ensureBusinessUnitAssociate({
        businessUnit,
        customer: linkedCustomer,
        roles: INITIAL_COMPANY_ROLES,
      });

      return input.commerceAccount;
    }),
    listBusinessUnitMembershipsForCustomerInStore,
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
