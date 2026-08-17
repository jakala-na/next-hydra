import type {
  BusinessUnit,
  BusinessUnitUpdateAction,
  ByProjectKeyRequestBuilder,
  Address as CommercetoolsAddress,
} from "@commercetools/platform-sdk";
import {
  AddressBookAccessDenied,
  AddressBookEntry,
  AddressBookEntryNotFound,
  type AddressBookOperation,
  AddressBookProviderFailure,
  type AddressBookReference,
  AddressBookWriteOutcomeUnknown,
  type AddressType,
  normalizeAddressTypes,
  type SaveAddressBookEntryInput,
} from "@repo/commerce/domain/address-book";
import type { CustomerCommercePrincipal } from "@repo/commerce/domain/commerce-request-context";
import type { ProviderFailureReason } from "@repo/commerce/domain/provider-failure";
import { AddressBook } from "@repo/commerce/services/address-book";
import { CommerceContext } from "@repo/commerce/services/commerce-context";
import { Effect, Layer, Option, Schema } from "effect";

import { commercetoolsClientsLayer } from "../client/layers";
import { CommercetoolsRestClient } from "../client/rest-client";
import {
  commercetoolsProviderFailureReason,
  isConcurrentModification,
} from "../client/versioned-write";
import {
  fromCommercetoolsAddressKey,
  toCommercetoolsAddressKey,
} from "./address-book-key";

const ACCESS_DENIED_STATUS_CODE = 403;
const NOT_FOUND_STATUS_CODE = 404;
const SERVER_ERROR_STATUS_CODE = 500;
const MAX_SAVE_RETRIES = 1;

export { toCommercetoolsAddressKey } from "./address-book-key";

const CommercetoolsError = Schema.Struct({
  statusCode: Schema.optional(Schema.Number),
  code: Schema.optional(Schema.String),
});

const decodeCommercetoolsError = (error: unknown) =>
  Option.getOrUndefined(Schema.decodeUnknownOption(CommercetoolsError)(error));

const errorStatusCode = (error: unknown) =>
  decodeCommercetoolsError(error)?.statusCode;

const isAccessDenied = (error: unknown) => {
  const statusCode = errorStatusCode(error);
  return (
    statusCode === ACCESS_DENIED_STATUS_CODE ||
    statusCode === NOT_FOUND_STATUS_CODE
  );
};

const isAmbiguousWriteFailure = (error: unknown) => {
  const statusCode = errorStatusCode(error);
  return (
    isConcurrentModification(error) ||
    statusCode === undefined ||
    statusCode >= SERVER_ERROR_STATUS_CODE
  );
};

const accessDenied = (operation: AddressBookOperation) =>
  new AddressBookAccessDenied({
    message: "Buyer cannot access the Business Unit Address Book",
    operation,
  });

const providerFailure = (
  operation: AddressBookOperation,
  cause: unknown,
  reason: ProviderFailureReason,
  message = `Failed to ${operation} Business Unit Address Book`
) => new AddressBookProviderFailure({ message, operation, cause, reason });

const writeOutcomeUnknown = (reference: AddressBookReference, cause: unknown) =>
  new AddressBookWriteOutcomeUnknown({
    cause,
    message: "Could not confirm whether the Address Book entry was saved",
    reference,
  });

const businessUnitRequest = (
  apiRoot: ByProjectKeyRequestBuilder,
  principal: CustomerCommercePrincipal
) =>
  apiRoot
    .asAssociate()
    .withAssociateIdValue({
      associateId: String(principal.customerId),
    })
    .businessUnits()
    .withKey({ key: String(principal.businessUnitKey) });

const readBusinessUnit = (
  apiRoot: ByProjectKeyRequestBuilder,
  principal: CustomerCommercePrincipal,
  operation: AddressBookOperation
) =>
  Effect.tryPromise({
    try: async () => {
      const response = await businessUnitRequest(apiRoot, principal)
        .get()
        .execute();
      return response.body;
    },
    catch: (cause) =>
      isAccessDenied(cause)
        ? accessDenied(operation)
        : providerFailure(
            operation,
            cause,
            commercetoolsProviderFailureReason(cause)
          ),
  });

const addressTypes = (
  businessUnit: BusinessUnit,
  addressId: string
): readonly AddressType[] => {
  const types: AddressType[] = [];

  if (businessUnit.shippingAddressIds?.includes(addressId)) {
    types.push("shipping");
  }
  if (businessUnit.billingAddressIds?.includes(addressId)) {
    types.push("billing");
  }

  return normalizeAddressTypes(types, {
    defaultShipping: businessUnit.defaultShippingAddressId === addressId,
    defaultBilling: businessUnit.defaultBillingAddressId === addressId,
  });
};

const toAddressBookEntry = (
  businessUnit: BusinessUnit,
  address: CommercetoolsAddress,
  reference: AddressBookReference,
  operation: AddressBookOperation
) => {
  const types = address.id ? addressTypes(businessUnit, address.id) : [];

  return Schema.decodeUnknownEffect(AddressBookEntry)({
    reference,
    address: {
      addressLine1: address.streetName,
      addressLine2: address.additionalStreetInfo,
      postalCode: address.postalCode,
      city: address.city,
      country: address.country,
      region: address.region,
    },
    types,
    defaultShipping: address.id === businessUnit.defaultShippingAddressId,
    defaultBilling: address.id === businessUnit.defaultBillingAddressId,
  }).pipe(
    Effect.mapError((cause) =>
      providerFailure(
        operation,
        cause,
        "invalidData",
        "Business Unit contains an invalid Address Book entry"
      )
    )
  );
};

const findAddress = (
  businessUnit: BusinessUnit,
  reference: AddressBookReference
) =>
  businessUnit.addresses.find(
    (address) => address.key === toCommercetoolsAddressKey(reference)
  );

const hasAddressType = (
  businessUnit: BusinessUnit,
  address: CommercetoolsAddress
) =>
  address.id !== undefined && addressTypes(businessUnit, address.id).length > 0;

const getEntry = (
  businessUnit: BusinessUnit,
  reference: AddressBookReference,
  operation: AddressBookOperation
) =>
  Effect.gen(function* () {
    const address = findAddress(businessUnit, reference);

    if (!(address && hasAddressType(businessUnit, address))) {
      return yield* new AddressBookEntryNotFound({
        message: "Address Book entry does not exist",
        reference,
      });
    }

    return yield* toAddressBookEntry(
      businessUnit,
      address,
      reference,
      operation
    );
  });

const listEntries = (
  businessUnit: BusinessUnit,
  operation: AddressBookOperation
) =>
  Effect.forEach(
    businessUnit.addresses,
    (address) => {
      const reference = address.key
        ? fromCommercetoolsAddressKey(address.key)
        : undefined;

      if (!(reference && hasAddressType(businessUnit, address))) {
        return Effect.succeed(undefined);
      }

      return toAddressBookEntry(
        businessUnit,
        address,
        reference,
        operation
      ).pipe(Effect.map((entry) => entry as AddressBookEntry | undefined));
    },
    { concurrency: "unbounded" }
  ).pipe(
    Effect.map((entries) =>
      entries.filter((entry): entry is AddressBookEntry => entry !== undefined)
    )
  );

class CommercetoolsAddressBookWriteFailure {
  readonly _tag = "CommercetoolsAddressBookWriteFailure";
  readonly cause: unknown;

  constructor(cause: unknown) {
    this.cause = cause;
  }
}

const updateActions = (
  input: SaveAddressBookEntryInput
): BusinessUnitUpdateAction[] => {
  const addressKey = toCommercetoolsAddressKey(input.reference);
  const types = normalizeAddressTypes(input.types, input);
  const actions: BusinessUnitUpdateAction[] = [
    {
      action: "addAddress",
      address: {
        key: addressKey,
        streetName: input.address.addressLine1,
        ...(input.address.addressLine2 === undefined
          ? {}
          : { additionalStreetInfo: input.address.addressLine2 }),
        postalCode: input.address.postalCode,
        city: input.address.city,
        ...(input.address.region === undefined
          ? {}
          : { region: input.address.region }),
        country: input.address.country,
      },
    },
  ];

  if (types.includes("shipping")) {
    actions.push({ action: "addShippingAddressId", addressKey });
  }
  if (types.includes("billing")) {
    actions.push({ action: "addBillingAddressId", addressKey });
  }
  if (input.defaultShipping) {
    actions.push({ action: "setDefaultShippingAddress", addressKey });
  }
  if (input.defaultBilling) {
    actions.push({ action: "setDefaultBillingAddress", addressKey });
  }

  return actions;
};

const writeBusinessUnit = (
  apiRoot: ByProjectKeyRequestBuilder,
  principal: CustomerCommercePrincipal,
  businessUnit: BusinessUnit,
  input: SaveAddressBookEntryInput
) =>
  Effect.tryPromise({
    try: async () => {
      const response = await businessUnitRequest(apiRoot, principal)
        .post({
          body: {
            version: businessUnit.version,
            actions: updateActions(input),
          },
        })
        .execute();
      return response.body;
    },
    catch: (cause) => new CommercetoolsAddressBookWriteFailure(cause),
  });

const entryFromSuccessfulWrite = (
  businessUnit: BusinessUnit,
  reference: AddressBookReference
) => {
  const saved = findAddress(businessUnit, reference);
  return saved
    ? toAddressBookEntry(businessUnit, saved, reference, "save")
    : Effect.fail(
        providerFailure(
          "save",
          businessUnit,
          "unexpectedResponse",
          "Commercetools did not return the saved Address Book entry"
        )
      );
};

const saveAbsentEntry = (
  apiRoot: ByProjectKeyRequestBuilder,
  principal: CustomerCommercePrincipal,
  businessUnit: BusinessUnit,
  input: SaveAddressBookEntryInput,
  retriesRemaining: number
): Effect.Effect<
  AddressBookEntry,
  | AddressBookAccessDenied
  | AddressBookProviderFailure
  | AddressBookWriteOutcomeUnknown
> =>
  Effect.gen(function* () {
    const writeResult = yield* Effect.result(
      writeBusinessUnit(apiRoot, principal, businessUnit, input)
    );

    if (writeResult._tag === "Success") {
      return yield* entryFromSuccessfulWrite(
        writeResult.success,
        input.reference
      );
    }

    const writeCause = writeResult.failure.cause;
    if (isAccessDenied(writeCause)) {
      return yield* accessDenied("save");
    }
    if (!isAmbiguousWriteFailure(writeCause)) {
      return yield* providerFailure(
        "save",
        writeCause,
        commercetoolsProviderFailureReason(writeCause)
      );
    }

    const reconciled = yield* readBusinessUnit(apiRoot, principal, "save").pipe(
      Effect.mapError((reconciliationFailure) =>
        writeOutcomeUnknown(input.reference, reconciliationFailure)
      )
    );
    const existing = findAddress(reconciled, input.reference);

    if (existing) {
      return yield* toAddressBookEntry(
        reconciled,
        existing,
        input.reference,
        "save"
      );
    }

    if (retriesRemaining === 0) {
      return yield* providerFailure(
        "save",
        writeCause,
        commercetoolsProviderFailureReason(writeCause)
      );
    }

    return yield* saveAbsentEntry(
      apiRoot,
      principal,
      reconciled,
      input,
      retriesRemaining - 1
    );
  });

const addressBookImplementationLayer = Layer.effect(
  AddressBook,
  Effect.gen(function* () {
    const commerceContext = yield* CommerceContext;
    const { apiRoot } = yield* CommercetoolsRestClient;

    return AddressBook.of({
      list: Effect.fn("CommercetoolsAddressBook.list")(function* () {
        const principal = yield* commerceContext.customerPrincipal();
        const businessUnit = yield* readBusinessUnit(
          apiRoot,
          principal,
          "list"
        );
        return yield* listEntries(businessUnit, "list");
      }),
      get: Effect.fn("CommercetoolsAddressBook.get")(function* (reference) {
        const principal = yield* commerceContext.customerPrincipal();
        const businessUnit = yield* readBusinessUnit(apiRoot, principal, "get");
        return yield* getEntry(businessUnit, reference, "get");
      }),
      save: Effect.fn("CommercetoolsAddressBook.save")(function* (input) {
        const principal = yield* commerceContext.customerPrincipal();
        const current = yield* readBusinessUnit(apiRoot, principal, "save");
        const existing = findAddress(current, input.reference);

        if (existing) {
          return yield* toAddressBookEntry(
            current,
            existing,
            input.reference,
            "save"
          );
        }

        return yield* saveAbsentEntry(
          apiRoot,
          principal,
          current,
          input,
          MAX_SAVE_RETRIES
        );
      }),
    });
  })
);

export const addressBookLayerFrom = (apiRoot: ByProjectKeyRequestBuilder) =>
  addressBookImplementationLayer.pipe(
    Layer.provide(CommercetoolsRestClient.testLayer(apiRoot))
  );

export const addressBookLayer = addressBookImplementationLayer.pipe(
  Layer.provide(commercetoolsClientsLayer)
);
