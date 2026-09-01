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
  CommerceCompanyMember,
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceBusinessUnitLabel,
  CommerceBusinessUnitMembership,
  CommerceCustomerId,
  CommerceCustomerProfile,
  CompanyRole,
  CompanyRoleList,
  CompanyRoles,
  INITIAL_COMPANY_ROLES,
} from "@repo/commerce/domain/commerce-account";
import type {
  CompanyRoleList as CompanyRoleListType,
  CompanyRoles as CompanyRolesType,
} from "@repo/commerce/domain/commerce-account";
import type { AuthUserId } from "@repo/commerce/domain/commerce-request-context";
import {
  CommerceAccountUnavailable,
  CommerceAccounts,
  CommerceCustomerEmailConflict,
  CommerceCustomerIdNotFound,
  CommerceCustomerProfileNotFound,
} from "@repo/commerce/services/commerce-accounts";
import type {
  AcceptedCommerceIdentity,
  CommerceAccountRegistrationInput,
  RedactedString,
} from "@repo/commerce/services/commerce-accounts";
import {
  CommerceCompanyMembershipChanged,
  CommerceCompanyMemberRemainingMembership,
  CommerceCompanyMembershipRevision,
  CommerceCompanyMembershipRoster,
  CommerceCompanyMemberships,
  DeletedCommerceCompanyMemberRemoval,
  RetainedCommerceCompanyMemberRemoval,
} from "@repo/commerce/services/commerce-company-memberships";
import type { StoreKey } from "@repo/commerce/store";
import { Effect, Layer, Redacted, Schema } from "effect";

import { toCommercetoolsAddressKey } from "../address-book/address-book-key";
import { commercetoolsClientsLayer } from "../client/layers";
import { CommercetoolsRestClient } from "../client/rest-client";
import {
  commercetoolsProviderFailureReason,
  CommercetoolsRequestFailure,
  commercetoolsFailureCause,
  hasCommercetoolsErrorCode,
  isConcurrentModification,
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

const commerceCompanyMemberNames = (
  customer: Customer
): Pick<CommerceCompanyMember, "firstName" | "lastName"> => {
  const firstName =
    customer.firstName === undefined
      ? undefined
      : Redacted.make(customer.firstName, { label: "personName" });
  const lastName =
    customer.lastName === undefined
      ? undefined
      : Redacted.make(customer.lastName, { label: "personName" });

  if (firstName !== undefined && lastName !== undefined) {
    return { firstName, lastName };
  }
  if (firstName !== undefined) {
    return { firstName };
  }
  if (lastName !== undefined) {
    return { lastName };
  }
  return {};
};

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

const roleKeysForCustomer = (
  associates:
    | readonly {
        readonly associateRoleAssignments: readonly {
          readonly associateRole: { readonly key: string };
        }[];
        readonly customer: { readonly id: string };
      }[]
    | undefined,
  customerId: CommerceCustomerId
) =>
  (associates ?? [])
    .filter((associate) => associate.customer.id === customerId)
    .flatMap((associate) =>
      associate.associateRoleAssignments.map(
        (assignment) => assignment.associateRole.key
      )
    );

const decodeCompanyRoleList = (roleKeys: readonly string[]) =>
  Schema.decodeSync(CompanyRoleList)(
    [...new Set(roleKeys)].filter(Schema.is(CompanyRole))
  );

const directCompanyRolesForCustomer = (
  businessUnit: BusinessUnit,
  customerId: CommerceCustomerId
): CompanyRoleListType =>
  decodeCompanyRoleList(
    roleKeysForCustomer(businessUnit.associates, customerId)
  );

const inheritedCompanyRolesForCustomer = (
  businessUnit: BusinessUnit,
  customerId: CommerceCustomerId
): CompanyRoleListType =>
  decodeCompanyRoleList(
    roleKeysForCustomer(businessUnit.inheritedAssociates, customerId)
  );

const companyRolesForCustomer = (
  businessUnit: BusinessUnit,
  customerId: CommerceCustomerId
): CompanyRolesType => {
  const directRoles = directCompanyRolesForCustomer(businessUnit, customerId);
  const inheritedRoles = inheritedCompanyRolesForCustomer(
    businessUnit,
    customerId
  );

  return Schema.decodeUnknownSync(CompanyRoles)([
    ...new Set([...directRoles, ...inheritedRoles]),
  ]);
};

const authUserId = (identity: AcceptedCommerceIdentity) => identity.authUserId;

const customerKeyFromAcceptedIdentity = (identity: AcceptedCommerceIdentity) =>
  `auth-customer-${authUserId(identity)}`;

const customerEmail = (identity: AcceptedCommerceIdentity) =>
  Redacted.value(identity.email);

const normalizedCustomerEmail = (email: RedactedString | string) => {
  const value = Redacted.isRedacted(email)
    ? String(Redacted.value(email))
    : email;

  return value.trim().toLowerCase();
};

const customerFirstName = (identity: AcceptedCommerceIdentity) =>
  Redacted.value(identity.firstName);

const customerLastName = (identity: AcceptedCommerceIdentity) =>
  Redacted.value(identity.lastName);

const toCommerceCustomerId = (customer: Customer) =>
  CommerceCustomerId.make(customer.id);

const toCommerceBusinessUnitId = (businessUnit: BusinessUnit) =>
  CommerceBusinessUnitId.make(businessUnit.id);

const registrationStore = (registration: CommerceAccountRegistrationInput) => ({
  key: String(registration.storeKey),
  typeId: "store" as const,
});

const makeCommerceCapabilities = (apiRoot: ByProjectKeyRequestBuilder) => {
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

  const findCustomerById = (commerceCustomerId: CommerceCustomerId) =>
    Effect.tryPromise({
      catch: (cause) =>
        new CommercetoolsRequestFailure({
          cause,
          message: "Failed to read Commercetools customer",
        }),
      try: async () => {
        const response = await apiRoot
          .customers()
          .withId({ ID: String(commerceCustomerId) })
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

  const findCustomerByAuthUserId = (identity: AcceptedCommerceIdentity) =>
    queryFirstCustomer(`externalId = ${JSON.stringify(authUserId(identity))}`);

  const findCustomerByEmail = (identity: AcceptedCommerceIdentity) =>
    queryFirstCustomer(
      `lowercaseEmail = ${JSON.stringify(
        normalizedCustomerEmail(identity.email)
      )}`
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

  const findAnyBusinessUnitMembership = Effect.fn(
    "CommercetoolsCommerceAccounts.findAnyBusinessUnitMembership"
  )((customerId: CommerceCustomerId) =>
    commerceAccountRequest(
      "Failed to check Commercetools Business Unit memberships",
      async () => {
        const response = await apiRoot
          .businessUnits()
          .get({
            queryArgs: {
              limit: 1,
              where: businessUnitForCustomerPredicate(customerId),
            },
          })
          .execute();

        return response.body.results[0] ?? null;
      }
    )
  );

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
    Effect.tryPromise({
      catch: (cause) =>
        new CommercetoolsRequestFailure({
          cause,
          message: "Failed to create Commercetools customer",
        }),
      try: async () => {
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
      },
    });

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

  const claimedCustomerConflict = () =>
    new CommerceCustomerEmailConflict({
      message: "A Commerce customer already owns the invited identity or email",
    });

  const isAcceptedIdentityCustomer = (
    customer: Customer,
    identity: AcceptedCommerceIdentity
  ) => customer.externalId === authUserId(identity);

  const validateAcceptedIdentityCustomer = (
    customer: Customer,
    identity: AcceptedCommerceIdentity
  ) =>
    isAcceptedIdentityCustomer(customer, identity)
      ? Effect.succeed(customer)
      : Effect.fail(claimedCustomerConflict());

  const findAcceptedIdentityCustomer = (identity: AcceptedCommerceIdentity) =>
    Effect.gen(function* () {
      const byKey = yield* getCustomerByKey(
        customerKeyFromAcceptedIdentity(identity)
      );
      if (byKey !== null) {
        return yield* validateAcceptedIdentityCustomer(byKey, identity);
      }

      const byAuthUserId = yield* findCustomerByAuthUserId(identity);
      if (byAuthUserId !== null) {
        return yield* validateAcceptedIdentityCustomer(byAuthUserId, identity);
      }

      const byEmail = yield* findCustomerByEmail(identity);
      if (byEmail !== null) {
        return yield* validateAcceptedIdentityCustomer(byEmail, identity);
      }

      return null;
    });

  const ensureAcceptedIdentityCustomer = (
    identity: AcceptedCommerceIdentity,
    knownCustomer?: Customer | null
  ) =>
    Effect.gen(function* () {
      const existing =
        knownCustomer === undefined
          ? yield* findAcceptedIdentityCustomer(identity)
          : knownCustomer;
      const customer =
        existing ??
        (yield* createCustomerFromAcceptedIdentity(identity).pipe(
          Effect.catchTag("CommercetoolsRequestFailure", (failure) => {
            if (
              hasCommercetoolsErrorCode(
                failure.cause,
                "DuplicateField",
                "DuplicateFieldWithConflictingResource"
              )
            ) {
              return findAcceptedIdentityCustomer(identity).pipe(
                Effect.flatMap((recovered) =>
                  recovered === null
                    ? Effect.die(
                        new Error(
                          "Commercetools reported a duplicate customer without exposing the conflicting customer",
                          { cause: failure.cause }
                        )
                      )
                    : Effect.succeed(recovered)
                )
              );
            }

            return failAccountRequest(failure.message, failure.cause);
          })
        ));

      return yield* syncCustomerIdentity(customer, {
        acceptedIdentity: identity,
      });
    });

  const deleteCustomer = (customer: Customer) =>
    retryVersionedWrite({
      attempt: (current: Customer) =>
        commercetoolsRequest(
          "Failed to delete orphaned Commercetools customer",
          async () => {
            await apiRoot
              .customers()
              .withId({ ID: current.id })
              .delete({ queryArgs: { version: current.version } })
              .execute();
          }
        ),
      input: customer,
      operation: "commerceAccount.customer.deleteOrphan",
      resolveConflict: (conflict, current) =>
        Effect.succeed(
          new RetryVersionedWrite({
            ...current,
            version: conflict.currentVersion,
          })
        ),
    }).pipe(
      Effect.catch((error) =>
        isNotFoundError(error)
          ? Effect.void
          : failAccountRequest(
              "Failed to delete orphaned Commercetools customer",
              commercetoolsFailureCause(error)
            )
      )
    );

  const replaceOrphanedCustomer = (
    customer: Customer,
    identity: AcceptedCommerceIdentity
  ) =>
    Effect.gen(function* () {
      yield* deleteCustomer(customer);

      const replacement = yield* createCustomerFromAcceptedIdentity(
        identity
      ).pipe(
        Effect.catchTag("CommercetoolsRequestFailure", (failure) => {
          if (
            hasCommercetoolsErrorCode(
              failure.cause,
              "DuplicateField",
              "DuplicateFieldWithConflictingResource"
            )
          ) {
            return findAcceptedIdentityCustomer(identity).pipe(
              Effect.flatMap((recovered) =>
                recovered === null
                  ? Effect.die(
                      new Error(
                        "Commercetools reported a duplicate replacement customer without exposing it",
                        { cause: failure.cause }
                      )
                    )
                  : Effect.succeed(recovered)
              )
            );
          }

          return failAccountRequest(failure.message, failure.cause);
        })
      );

      if (replacement.id === customer.id) {
        return yield* new CommerceAccountUnavailable({
          cause: new Error(
            "The retired Commercetools customer is still visible to identity lookup"
          ),
          message:
            "Commercetools has not made the replacement customer available yet",
        });
      }

      return yield* syncCustomerIdentity(replacement, {
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
              "var.email": normalizedCustomerEmail(email),
              where: "lowercaseEmail = :email",
            },
          })
          .execute();

        return response.body.results.length > 0;
      }
    )
  );

  const accounts = CommerceAccounts.of({
    addAssociate: Effect.fn("CommercetoolsCommerceAccounts.addAssociate")(
      function* (input) {
        const existingCustomer = yield* findAcceptedIdentityCustomer(
          input.acceptedIdentity
        );
        const discoveredCustomer =
          existingCustomer ??
          (yield* ensureAcceptedIdentityCustomer(
            input.acceptedIdentity,
            existingCustomer
          ));
        const businessUnit = yield* getBusinessUnitById(input.businessUnitId);
        const directlyAssociated =
          existingCustomer !== null &&
          businessUnit.associates?.some(
            (associate) => associate.customer.id === existingCustomer.id
          );

        const customer = yield* Effect.gen(function* () {
          if (existingCustomer === null) {
            return discoveredCustomer;
          }
          if (directlyAssociated) {
            return yield* syncCustomerIdentity(existingCustomer, {
              acceptedIdentity: input.acceptedIdentity,
            });
          }

          const remainingMembership = yield* findAnyBusinessUnitMembership(
            toCommerceCustomerId(existingCustomer)
          );
          if (remainingMembership !== null) {
            return yield* syncCustomerIdentity(existingCustomer, {
              acceptedIdentity: input.acceptedIdentity,
            });
          }

          return yield* replaceOrphanedCustomer(
            existingCustomer,
            input.acceptedIdentity
          );
        });

        const associatedBusinessUnit = yield* ensureBusinessUnitAssociate({
          businessUnit,
          customer,
          roles: input.roles,
        });

        return new CommerceAssociateMembership({
          authUserId: input.acceptedIdentity.authUserId,
          businessUnitId: input.businessUnitId,
          customerId: toCommerceCustomerId(customer),
          roles: Schema.decodeUnknownSync(CompanyRoles)([
            ...new Set([
              ...directCompanyRolesForCustomer(
                businessUnit,
                toCommerceCustomerId(customer)
              ),
              ...inheritedCompanyRolesForCustomer(
                businessUnit,
                toCommerceCustomerId(customer)
              ),
              ...directCompanyRolesForCustomer(
                associatedBusinessUnit,
                toCommerceCustomerId(customer)
              ),
              ...inheritedCompanyRolesForCustomer(
                associatedBusinessUnit,
                toCommerceCustomerId(customer)
              ),
              ...input.roles,
            ]),
          ]),
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

  const reconcileCustomerDisposition = Effect.fn(
    "CommercetoolsCommerceCompanyMemberships.reconcileCustomerDisposition"
  )(function* (customerId: CommerceCustomerId) {
    const remainingBusinessUnit =
      yield* findAnyBusinessUnitMembership(customerId);
    if (remainingBusinessUnit !== null) {
      return new RetainedCommerceCompanyMemberRemoval({
        customerDisposition: "retained",
        remainingMembership: new CommerceCompanyMemberRemainingMembership({
          businessUnitId: toCommerceBusinessUnitId(remainingBusinessUnit),
          roles: companyRolesForCustomer(remainingBusinessUnit, customerId),
        }),
      });
    }

    const customer = yield* findCustomerById(customerId);
    if (customer === null) {
      return new DeletedCommerceCompanyMemberRemoval({
        customerDisposition: "deleted",
      });
    }

    yield* deleteCustomer(customer);

    return new DeletedCommerceCompanyMemberRemoval({
      customerDisposition: "deleted",
    });
  });

  const companyMemberships = CommerceCompanyMemberships.of({
    getRoster: Effect.fn("CommercetoolsCommerceCompanyMemberships.getRoster")(
      function* (businessUnitId) {
        const businessUnit = yield* getBusinessUnitById(businessUnitId);

        const customerIds = [
          ...new Set(
            [
              ...(businessUnit.associates ?? []),
              ...(businessUnit.inheritedAssociates ?? []),
            ].map((associate) => associate.customer.id)
          ),
        ];
        const members = yield* Effect.forEach(
          customerIds,
          (customerId) =>
            getCustomerById(CommerceCustomerId.make(customerId)).pipe(
              Effect.flatMap((customer) => {
                if (customer.externalId === undefined) {
                  return Effect.die(
                    new Error(
                      `Commercetools customer ${customer.id} has no authentication identity`
                    )
                  );
                }

                return Effect.succeed(
                  new CommerceCompanyMember({
                    authUserId: customer.externalId,
                    businessUnitId,
                    customerId: CommerceCustomerId.make(customer.id),
                    directlyAssociated: (businessUnit.associates ?? []).some(
                      (associate) => associate.customer.id === customer.id
                    ),
                    email: Redacted.make(customer.email, { label: "email" }),
                    ...commerceCompanyMemberNames(customer),
                    inheritedRoles: inheritedCompanyRolesForCustomer(
                      businessUnit,
                      CommerceCustomerId.make(customer.id)
                    ),
                    roles: companyRolesForCustomer(
                      businessUnit,
                      CommerceCustomerId.make(customer.id)
                    ),
                  })
                );
              })
            ),
          { concurrency: 8 }
        );

        return new CommerceCompanyMembershipRoster({
          businessUnitId,
          members,
          revision: CommerceCompanyMembershipRevision.make(
            String(businessUnit.version)
          ),
        });
      }
    ),
    reconcileCustomerDisposition,
    removeMember: Effect.fn(
      "CommercetoolsCommerceCompanyMemberships.removeMember"
    )(function* (input) {
      yield* commercetoolsRequest(
        "Failed to remove Commercetools business unit associate",
        async () => {
          await apiRoot
            .businessUnits()
            .withId({ ID: String(input.businessUnitId) })
            .post({
              body: {
                actions: [
                  {
                    action: "removeAssociate",
                    customer: {
                      id: String(input.customerId),
                      typeId: "customer",
                    },
                  },
                ],
                version: Schema.decodeUnknownSync(Schema.NumberFromString)(
                  input.expectedRevision
                ),
              },
            })
            .execute();
        }
      ).pipe(
        Effect.catchTag(
          "CommercetoolsRequestFailure",
          (
            failure
          ): Effect.Effect<
            never,
            CommerceAccountUnavailable | CommerceCompanyMembershipChanged
          > => {
            if (isConcurrentModification(failure.cause)) {
              return Effect.fail(
                new CommerceCompanyMembershipChanged({
                  businessUnitId: input.businessUnitId,
                  message: "Company membership changed during removal",
                })
              );
            }
            return failAccountRequest(failure.message, failure.cause);
          }
        )
      );

      return yield* reconcileCustomerDisposition(input.customerId);
    }),
  });

  return { accounts, companyMemberships };
};

export const commerceAccountsLayerFrom = (
  apiRoot: ByProjectKeyRequestBuilder
) =>
  Layer.succeed(CommerceAccounts, makeCommerceCapabilities(apiRoot).accounts);

export const commerceCompanyMembershipsLayerFrom = (
  apiRoot: ByProjectKeyRequestBuilder
) =>
  Layer.succeed(
    CommerceCompanyMemberships,
    makeCommerceCapabilities(apiRoot).companyMemberships
  );

const commerceAccountsImplementationLayer = Layer.effect(
  CommerceAccounts,
  Effect.gen(function* () {
    const { apiRoot } = yield* CommercetoolsRestClient;
    return makeCommerceCapabilities(apiRoot).accounts;
  })
);

const commerceCompanyMembershipsImplementationLayer = Layer.effect(
  CommerceCompanyMemberships,
  Effect.gen(function* () {
    const { apiRoot } = yield* CommercetoolsRestClient;
    return makeCommerceCapabilities(apiRoot).companyMemberships;
  })
);

export const commerceAccountsLayer = commerceAccountsImplementationLayer.pipe(
  Layer.provide(commercetoolsClientsLayer)
);

export const commerceCompanyMembershipsLayer =
  commerceCompanyMembershipsImplementationLayer.pipe(
    Layer.provide(commercetoolsClientsLayer)
  );
