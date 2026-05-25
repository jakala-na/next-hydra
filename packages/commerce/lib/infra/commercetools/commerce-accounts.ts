import type {
  AssociateDraft,
  BusinessUnit,
  BusinessUnitDraft,
  BusinessUnitUpdateAction,
  Customer,
  CustomerDraft,
  CustomerUpdateAction,
} from "@commercetools/platform-sdk";
import {
  CommerceAccount,
  CommerceAssociateMembership,
} from "@repo/registration-effect/domain/commerce";
import {
  type AcceptedAuthIdentity,
  CommerceBusinessUnitId,
  CommerceCustomerId,
} from "@repo/registration-effect/domain/identity";
import type { Registration } from "@repo/registration-effect/domain/registration";
import type { CompanyRole } from "@repo/registration-effect/domain/roles";
import {
  CommerceAccountError,
  CommerceAccounts,
} from "@repo/registration-effect/services/commerce-account";
import { Effect, Layer, Redacted, Schema } from "effect";
import { apiRoot } from "../../client/api-root";

const NOT_FOUND_STATUS_CODE = 404;

const CommercetoolsStatusCodeError = Schema.Struct({
  statusCode: Schema.Number,
});

const CommercetoolsErrorInfo = Schema.Struct({
  statusCode: Schema.optional(Schema.Number),
  code: Schema.optional(Schema.String),
  message: Schema.optional(Schema.String),
  body: Schema.optional(
    Schema.Struct({
      message: Schema.optional(Schema.String),
      errors: Schema.optional(
        Schema.Array(
          Schema.Struct({
            code: Schema.optional(Schema.String),
            message: Schema.optional(Schema.String),
          })
        )
      ),
    })
  ),
});

const isNotFoundError = (error: unknown) =>
  Schema.decodeUnknownOption(CommercetoolsStatusCodeError)(error).pipe(
    (option) =>
      option._tag === "Some" &&
      option.value.statusCode === NOT_FOUND_STATUS_CODE
  );

const formatCause = (cause: unknown) => {
  if (cause instanceof Error) {
    return cause.message;
  }

  const decoded = Schema.decodeUnknownOption(CommercetoolsErrorInfo)(cause);
  if (decoded._tag === "Some") {
    const error = decoded.value;
    const errors =
      error.body?.errors?.map((detail) =>
        [detail.code, detail.message].filter(Boolean).join(": ")
      ) ?? [];
    const parts = [
      error.statusCode ? `status ${String(error.statusCode)}` : undefined,
      error.code,
      error.message,
      error.body?.message,
      ...errors,
    ].filter(Boolean);

    if (parts.length > 0) {
      return parts.join("; ");
    }
  }

  try {
    return JSON.stringify(cause);
  } catch {
    return String(cause);
  }
};

const accountError = (reason: string, cause?: unknown) =>
  new CommerceAccountError({
    message: cause ? `${reason}: ${formatCause(cause)}` : reason,
  });

const customerKey = (registration: Registration) =>
  `registration-customer-${registration.id}`;

const businessUnitKey = (registration: Registration) =>
  `registration-business-unit-${registration.id}`;

const associateRoleKey = (role: CompanyRole) => role;

const customerKeyFromAcceptedIdentity = (identity: AcceptedAuthIdentity) =>
  `auth-customer-${authUserId(identity)}`;

const authUserId = (identity: AcceptedAuthIdentity) =>
  String(identity.authUserId);

const customerEmail = (identity: AcceptedAuthIdentity) =>
  Redacted.value(identity.email);

const customerFirstName = (identity: AcceptedAuthIdentity) =>
  Redacted.value(identity.firstName);

const customerLastName = (identity: AcceptedAuthIdentity) =>
  Redacted.value(identity.lastName);

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
    catch: (cause) => cause,
  }).pipe(
    Effect.catch((cause) =>
      isNotFoundError(cause)
        ? Effect.succeed(null)
        : Effect.fail(
            accountError("Failed to read Commercetools customer", cause)
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
    catch: (cause) => cause,
  }).pipe(
    Effect.catch((cause) =>
      isNotFoundError(cause)
        ? Effect.succeed(null)
        : Effect.fail(
            accountError("Failed to read Commercetools business unit", cause)
          )
    )
  );

const getCustomerById = (commerceCustomerId: CommerceCustomerId) =>
  Effect.tryPromise({
    try: async () => {
      const response = await apiRoot
        .customers()
        .withId({ ID: String(commerceCustomerId) })
        .get()
        .execute();
      return response.body;
    },
    catch: (cause) =>
      accountError("Failed to read Commercetools customer", cause),
  });

const queryFirstCustomer = (where: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await apiRoot
        .customers()
        .get({ queryArgs: { where, limit: 1 } })
        .execute();

      return response.body.results[0] ?? null;
    },
    catch: (cause) =>
      accountError("Failed to query Commercetools customer", cause),
  });

const getCustomerByAcceptedIdentity = (identity: AcceptedAuthIdentity) =>
  queryFirstCustomer(
    `externalId = ${JSON.stringify(authUserId(identity))} or email = ${JSON.stringify(customerEmail(identity))}`
  );

const getBusinessUnitById = (commerceBusinessUnitId: CommerceBusinessUnitId) =>
  Effect.tryPromise({
    try: async () => {
      const response = await apiRoot
        .businessUnits()
        .withId({ ID: String(commerceBusinessUnitId) })
        .get()
        .execute();
      return response.body;
    },
    catch: (cause) =>
      accountError("Failed to read Commercetools business unit", cause),
  });

const toCustomerDraft = (
  registration: Registration,
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
    addresses: [
      {
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
    defaultBillingAddress: 0,
    defaultShippingAddress: 0,
    billingAddresses: [0],
    shippingAddresses: [0],
    isEmailVerified: true,
  };
};

const toBusinessUnitDraft = (
  registration: Registration,
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
  };
};

const createCustomer = (registration: Registration, key: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await apiRoot
        .customers()
        .post({ body: toCustomerDraft(registration, key) })
        .execute();

      return response.body.customer;
    },
    catch: (cause) =>
      accountError("Failed to create Commercetools customer", cause),
  });

const createCustomerFromAcceptedIdentity = (identity: AcceptedAuthIdentity) =>
  Effect.tryPromise({
    try: async () => {
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
    },
    catch: (cause) =>
      accountError("Failed to create Commercetools customer", cause),
  });

const createBusinessUnit = (registration: Registration, key: string) =>
  Effect.tryPromise({
    try: async () => {
      const response = await apiRoot
        .businessUnits()
        .post({ body: toBusinessUnitDraft(registration, key) })
        .execute();

      return response.body;
    },
    catch: (cause) =>
      accountError("Failed to create Commercetools business unit", cause),
  });

const toCommerceCustomerId = (customer: Customer) =>
  CommerceCustomerId.make(customer.id);

const toCommerceBusinessUnitId = (businessUnit: BusinessUnit) =>
  CommerceBusinessUnitId.make(businessUnit.id);

const syncCustomerIdentity = (
  customer: Customer,
  input: {
    readonly acceptedIdentity: AcceptedAuthIdentity;
  }
) => {
  const actions: CustomerUpdateAction[] = [];
  const email = Redacted.value(input.acceptedIdentity.email);
  const firstName = Redacted.value(input.acceptedIdentity.firstName);
  const lastName = Redacted.value(input.acceptedIdentity.lastName);

  const externalId = authUserId(input.acceptedIdentity);

  if (customer.externalId !== externalId) {
    actions.push({
      action: "setExternalId",
      externalId,
    });
  }

  if (customer.email !== email) {
    actions.push({
      action: "changeEmail",
      email,
    });
  }

  if (customer.firstName !== firstName) {
    actions.push({
      action: "setFirstName",
      firstName,
    });
  }

  if (customer.lastName !== lastName) {
    actions.push({
      action: "setLastName",
      lastName,
    });
  }

  if (actions.length === 0) {
    return Effect.succeed(customer);
  }

  return Effect.tryPromise({
    try: async () => {
      const response = await apiRoot
        .customers()
        .withId({ ID: customer.id })
        .post({
          body: {
            version: customer.version,
            actions,
          },
        })
        .execute();

      return response.body;
    },
    catch: (cause) =>
      accountError("Failed to sync Commercetools customer identity", cause),
  });
};

const ensureAcceptedIdentityCustomer = (identity: AcceptedAuthIdentity) =>
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
  role: CompanyRole
): AssociateDraft => ({
  customer: { typeId: "customer", id: customer.id },
  associateRoleAssignments: [
    {
      associateRole: {
        typeId: "associate-role",
        key: associateRoleKey(role),
      },
      inheritance: "Enabled",
    },
  ],
});

const hasAssociateRole = (
  businessUnit: BusinessUnit,
  customer: Customer,
  role: CompanyRole
) => {
  const roleKey = associateRoleKey(role);
  return businessUnit.associates?.some(
    (associate) =>
      associate.customer.id === customer.id &&
      associate.associateRoleAssignments.some(
        (assignment) => assignment.associateRole.key === roleKey
      )
  );
};

const ensureBusinessUnitAssociate = (input: {
  readonly businessUnit: BusinessUnit;
  readonly customer: Customer;
  readonly role: CompanyRole;
}) => {
  if (hasAssociateRole(input.businessUnit, input.customer, input.role)) {
    return Effect.succeed(input.businessUnit);
  }

  const existingAssociate = input.businessUnit.associates?.find(
    (associate) => associate.customer.id === input.customer.id
  );
  const action: BusinessUnitUpdateAction = existingAssociate
    ? {
        action: "changeAssociate",
        associate: associateDraft(input.customer, input.role),
      }
    : {
        action: "addAssociate",
        associate: associateDraft(input.customer, input.role),
      };

  return Effect.tryPromise({
    try: async () => {
      const response = await apiRoot
        .businessUnits()
        .withId({ ID: input.businessUnit.id })
        .post({
          body: {
            version: input.businessUnit.version,
            actions: [action],
          },
        })
        .execute();

      return response.body;
    },
    catch: (cause) =>
      accountError(
        "Failed to add Commercetools business unit associate",
        cause
      ),
  });
};

export const layerCommercetoolsCommerceAccounts = Layer.succeed(
  CommerceAccounts,
  CommerceAccounts.of({
    createFromRegistration: Effect.fn(
      "CommercetoolsCommerceAccounts.createFromRegistration"
    )(function* (registration) {
      if (registration._tag === "RejectedRegistration") {
        return yield* accountError(
          "Cannot provision commerce for a rejected registration"
        );
      }

      const cKey = customerKey(registration);
      const buKey = businessUnitKey(registration);
      const customer =
        (yield* getCustomerByKey(cKey)) ??
        (yield* createCustomer(registration, cKey));
      const businessUnit =
        (yield* getBusinessUnitByKey(buKey)) ??
        (yield* createBusinessUnit(registration, buKey));

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
  })
);
