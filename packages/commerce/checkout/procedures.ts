import "server-only";
import {
  ActionInputIssue,
  type ActionSchemaIssuePath,
  normalizeActionSchemaIssuePath,
} from "@repo/actions";
import { Effect, Schema, SchemaIssue } from "effect";

import { AddressBookReference } from "../domain/address-book";
import { CartId } from "../domain/cart";
import {
  CheckoutMutationIssuePath,
  CheckoutState,
  CountryCodeFromString,
} from "../domain/checkout";
import type {
  SaveCheckoutContactInput,
  SaveCheckoutDeliveryDetailsInput,
} from "../lib/checkout/checkout-session";
import { CheckoutSession } from "../lib/checkout/checkout-session";
import type { CommerceActionClient } from "../runtime";
import {
  SaveCheckoutContactActionError,
  SaveCheckoutDeliveryDetailsActionError,
} from "./action-contract";
import { logUnexpectedCheckoutMutationFailure } from "./action-diagnostics";
import { MANUAL_DELIVERY_ADDRESS_CHOICE } from "./save-delivery-details-action-contract";

const RequiredFormString = Schema.Trim.pipe(
  Schema.check(Schema.isMinLength(1))
);

const SaveCheckoutContactForm = Schema.fromFormData(
  Schema.Union([
    Schema.Struct({
      cartId: CartId,
      email: RequiredFormString,
      firstName: RequiredFormString,
      lastName: RequiredFormString,
      phoneNumber: Schema.optional(Schema.String),
      source: Schema.Literal("manual"),
    }),
    Schema.Struct({
      cartId: CartId,
      source: Schema.Literal("customerProfile"),
    }),
  ])
);

const FormCheckboxValue = Schema.optional(
  Schema.Literals(["false", "on", "true"])
);

const SaveCheckoutDeliveryDetailsForm = Schema.fromFormData(
  Schema.Union([
    Schema.Struct({
      cartId: CartId,
      deliveryAddressChoice: AddressBookReference,
    }),
    Schema.Struct({
      addressLine1: RequiredFormString,
      addressLine2: Schema.optional(Schema.String),
      cartId: CartId,
      city: RequiredFormString,
      country: CountryCodeFromString,
      deliveryAddressChoice: Schema.Literal(MANUAL_DELIVERY_ADDRESS_CHOICE),
      makeDefaultShipping: FormCheckboxValue,
      postalCode: RequiredFormString,
      region: Schema.optional(Schema.String),
      saveToAddressBook: FormCheckboxValue,
    }),
  ])
);

const optionalNonEmptyString = (value: string | undefined) =>
  value === undefined || value === "" ? undefined : value;

const formCheckbox = (value: "false" | "on" | "true" | undefined) =>
  value === "on" || value === "true";

const toSaveCheckoutContactInput = (
  input: typeof SaveCheckoutContactForm.Type
): SaveCheckoutContactInput => ({
  cart: { id: input.cartId },
  contact:
    input.source === "customerProfile"
      ? { source: "customerProfile" }
      : {
          buyerContact: {
            email: input.email,
            firstName: input.firstName,
            lastName: input.lastName,
            ...(optionalNonEmptyString(input.phoneNumber) === undefined
              ? {}
              : { phoneNumber: input.phoneNumber }),
          },
          source: "manual",
        },
});

const toSaveCheckoutDeliveryDetailsInput = (
  input: typeof SaveCheckoutDeliveryDetailsForm.Type
): SaveCheckoutDeliveryDetailsInput => {
  if (!("addressLine1" in input)) {
    return {
      cart: { id: input.cartId },
      deliveryDetails: {
        addressBookReference: input.deliveryAddressChoice,
        type: "addressBook",
      },
    };
  }

  const saveToAddressBook = formCheckbox(input.saveToAddressBook);
  const shippingAddress = {
    addressLine1: input.addressLine1,
    city: input.city,
    country: input.country,
    postalCode: input.postalCode,
    ...(optionalNonEmptyString(input.addressLine2) === undefined
      ? {}
      : { addressLine2: input.addressLine2 }),
    ...(optionalNonEmptyString(input.region) === undefined
      ? {}
      : { region: input.region }),
  };

  return {
    cart: { id: input.cartId },
    deliveryDetails: saveToAddressBook
      ? {
          makeDefaultShipping: formCheckbox(input.makeDefaultShipping),
          saveToAddressBook: true,
          shippingAddress,
          type: "manual",
        }
      : {
          saveToAddressBook: false,
          shippingAddress,
          type: "manual",
        },
  };
};

const saveCheckoutContactProgram = Effect.fn("CheckoutAction.saveContact")(
  (input: typeof SaveCheckoutContactForm.Type) =>
    CheckoutSession.saveContact(toSaveCheckoutContactInput(input)).pipe(
      Effect.tapError(logUnexpectedCheckoutMutationFailure)
    )
);

const saveCheckoutDeliveryDetailsProgram = Effect.fn(
  "CheckoutAction.saveDeliveryDetails"
)((input: typeof SaveCheckoutDeliveryDetailsForm.Type) =>
  CheckoutSession.saveDeliveryDetails(
    toSaveCheckoutDeliveryDetailsInput(input)
  ).pipe(
    Effect.tapError(logUnexpectedCheckoutMutationFailure),
    Effect.map(({ state }) => state)
  )
);

const toCheckoutMutationIssuePath = (
  path: ActionSchemaIssuePath | undefined
): CheckoutMutationIssuePath =>
  normalizeActionSchemaIssuePath(CheckoutMutationIssuePath, path, "root");

const checkoutInputIssues = (
  error: Schema.SchemaError,
  rootMessage: string,
  includesPath: (path: CheckoutMutationIssuePath) => boolean
): readonly ActionInputIssue[] => {
  const formatted = SchemaIssue.makeFormatterStandardSchemaV1()(error.issue);
  const seen = new Set<CheckoutMutationIssuePath>();
  const issues: ActionInputIssue[] = [];

  for (const issue of formatted.issues) {
    const path = toCheckoutMutationIssuePath(issue.path);
    if (!includesPath(path) || seen.has(path)) {
      continue;
    }

    seen.add(path);
    issues.push(
      new ActionInputIssue({
        message: path === "root" ? rootMessage : "This field is invalid.",
        path: path === "root" ? [] : [path],
      })
    );
  }

  return issues.length === 0
    ? [new ActionInputIssue({ message: rootMessage, path: [] })]
    : issues;
};

const contactManualIssuePaths = new Set<CheckoutMutationIssuePath>([
  "email",
  "firstName",
  "lastName",
  "phoneNumber",
]);

const checkoutContactPath = (
  formData: FormData,
  path: CheckoutMutationIssuePath
) => {
  if (path === "root" || path === "cartId") {
    return true;
  }

  const source = formData.get("source");
  if (path === "source") {
    return source !== "manual" && source !== "customerProfile";
  }

  return source === "manual" && contactManualIssuePaths.has(path);
};

const deliveryManualIssuePaths = new Set<CheckoutMutationIssuePath>([
  "addressLine1",
  "addressLine2",
  "city",
  "country",
  "makeDefaultShipping",
  "postalCode",
  "region",
  "saveToAddressBook",
]);

const checkoutDeliveryDetailsPath = (
  formData: FormData,
  path: CheckoutMutationIssuePath
) => {
  if (path === "root" || path === "cartId") {
    return true;
  }

  const deliveryAddressChoice = formData.get("deliveryAddressChoice");
  if (path === "deliveryAddressChoice") {
    return deliveryAddressChoice !== MANUAL_DELIVERY_ADDRESS_CHOICE;
  }

  return (
    deliveryAddressChoice === MANUAL_DELIVERY_ADDRESS_CHOICE &&
    deliveryManualIssuePaths.has(path)
  );
};

const checkoutContactInputIssues = (
  error: Schema.SchemaError,
  _context: unknown,
  formData: FormData
) =>
  checkoutInputIssues(
    error,
    "Checkout Contact action input is invalid",
    (path) => checkoutContactPath(formData, path)
  );

const checkoutDeliveryDetailsInputIssues = (
  error: Schema.SchemaError,
  _context: unknown,
  formData: FormData
) =>
  checkoutInputIssues(
    error,
    "Checkout Delivery Details action input is invalid",
    (path) => checkoutDeliveryDetailsPath(formData, path)
  );

export const makeCheckoutProcedures = <RuntimeServices, Context extends object>(
  actions: CommerceActionClient<CheckoutSession, RuntimeServices, Context>
) => ({
  saveCheckoutContactProcedure: actions
    .procedure("CheckoutAction.saveContact")
    .input(SaveCheckoutContactForm)
    .output(CheckoutState)
    .error(SaveCheckoutContactActionError)
    .mapInputIssues(checkoutContactInputIssues)
    .handle(saveCheckoutContactProgram),
  saveCheckoutDeliveryDetailsProcedure: actions
    .procedure("CheckoutAction.saveDeliveryDetails")
    .input(SaveCheckoutDeliveryDetailsForm)
    .output(CheckoutState)
    .error(SaveCheckoutDeliveryDetailsActionError)
    .mapInputIssues(checkoutDeliveryDetailsInputIssues)
    .handle(saveCheckoutDeliveryDetailsProgram),
});
