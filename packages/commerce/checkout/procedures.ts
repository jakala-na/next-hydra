import "server-only";
import { normalizeActionSchemaIssuePath } from "@repo/actions";
import type { ActionSchemaIssuePath } from "@repo/actions";
import { ErrorIssue } from "@repo/errors";
import { Effect, Schema, SchemaIssue, SchemaTransformation } from "effect";

import { AddressBookReference } from "../domain/address-book";
import { CartId } from "../domain/cart";
import {
  CheckoutMutationIssuePath,
  CheckoutState,
  CountryCodeFromString,
} from "../domain/checkout";
import { DeliveryPlanSelection } from "../domain/delivery-plan";
import type {
  SaveCheckoutContactInput,
  SaveCheckoutDeliveryDetailsInput,
  SaveCheckoutShippingOptionsInput,
} from "../lib/checkout/checkout-session";
import { CheckoutSession } from "../lib/checkout/checkout-session";
import type { CommerceActionClient } from "../runtime";
import {
  SaveCheckoutContactActionError,
  SaveCheckoutDeliveryDetailsActionError,
  SaveCheckoutShippingOptionsActionError,
} from "./action-contract";
import type {
  CheckoutSaveContactExpectedFailure,
  CheckoutSaveDeliveryDetailsExpectedFailure,
  CheckoutSaveShippingOptionsExpectedFailure,
} from "./public-errors";
import {
  projectSaveCheckoutContactFailure,
  projectSaveCheckoutDeliveryDetailsFailure,
  projectSaveCheckoutShippingOptionsFailure,
} from "./public-errors";
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

const DeliveryPlanSelectionFromJson = Schema.String.pipe(
  Schema.decodeTo(Schema.Unknown, SchemaTransformation.fromJsonString()),
  Schema.decodeTo(DeliveryPlanSelection)
);

const SaveCheckoutShippingOptionsForm = Schema.fromFormData(
  Schema.Struct({
    cartId: CartId,
    selection: DeliveryPlanSelectionFromJson,
  })
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

const toSaveCheckoutShippingOptionsInput = (
  input: typeof SaveCheckoutShippingOptionsForm.Type
): SaveCheckoutShippingOptionsInput => ({
  cart: { id: input.cartId },
  selection: input.selection,
});

const saveCheckoutContactProgram = Effect.fn("CheckoutAction.saveContact")(
  (input: typeof SaveCheckoutContactForm.Type) =>
    CheckoutSession.saveContact(toSaveCheckoutContactInput(input))
);

const saveCheckoutDeliveryDetailsProgram = Effect.fn(
  "CheckoutAction.saveDeliveryDetails"
)((input: typeof SaveCheckoutDeliveryDetailsForm.Type) =>
  CheckoutSession.saveDeliveryDetails(
    toSaveCheckoutDeliveryDetailsInput(input)
  ).pipe(Effect.map(({ state }) => state))
);

const saveCheckoutShippingOptionsProgram = Effect.fn(
  "CheckoutAction.saveShippingOptions"
)((input: typeof SaveCheckoutShippingOptionsForm.Type) =>
  CheckoutSession.saveShippingOptions(toSaveCheckoutShippingOptionsInput(input))
);

const toCheckoutMutationIssuePath = (
  path: ActionSchemaIssuePath | undefined
): CheckoutMutationIssuePath =>
  normalizeActionSchemaIssuePath(CheckoutMutationIssuePath, path, "root");

const checkoutInputIssues = (
  error: Schema.SchemaError,
  rootMessage: string,
  includesPath: (path: CheckoutMutationIssuePath) => boolean
): readonly ErrorIssue[] => {
  const formatted = SchemaIssue.makeFormatterStandardSchemaV1()(error.issue);
  const seen = new Set<CheckoutMutationIssuePath>();
  const issues: ErrorIssue[] = [];

  for (const issue of formatted.issues) {
    const path = toCheckoutMutationIssuePath(issue.path);
    if (!includesPath(path) || seen.has(path)) {
      continue;
    }

    seen.add(path);
    issues.push(
      new ErrorIssue({
        message: path === "root" ? rootMessage : "This field is invalid.",
        path: path === "root" ? [] : [path],
      })
    );
  }

  return issues.length === 0
    ? [new ErrorIssue({ message: rootMessage, path: [] })]
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

const checkoutShippingOptionsInputIssues = (error: Schema.SchemaError) =>
  checkoutInputIssues(
    error,
    "Checkout Shipping Options action input is invalid",
    (path) => path === "root" || path === "cartId"
  );

export const makeCheckoutProcedures = <
  RuntimeServices,
  Context extends { readonly locale: string },
>(
  actions: CommerceActionClient<CheckoutSession, RuntimeServices, Context>
) => ({
  saveCheckoutContactProcedure: actions
    .procedure("CheckoutAction.saveContact")
    .input(SaveCheckoutContactForm)
    .output(CheckoutState)
    .error(SaveCheckoutContactActionError)
    .mapInputIssues(checkoutContactInputIssues)
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This is an Effect action error mapper, not Promise control flow.
    .mapError<CheckoutSaveContactExpectedFailure>((error, { locale }) =>
      projectSaveCheckoutContactFailure(error, locale)
    )
    .handle(saveCheckoutContactProgram),
  saveCheckoutDeliveryDetailsProcedure: actions
    .procedure("CheckoutAction.saveDeliveryDetails")
    .input(SaveCheckoutDeliveryDetailsForm)
    .output(CheckoutState)
    .error(SaveCheckoutDeliveryDetailsActionError)
    .mapInputIssues(checkoutDeliveryDetailsInputIssues)
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This is an Effect action error mapper, not Promise control flow.
    .mapError<CheckoutSaveDeliveryDetailsExpectedFailure>((error, { locale }) =>
      projectSaveCheckoutDeliveryDetailsFailure(error, locale)
    )
    .handle(saveCheckoutDeliveryDetailsProgram),
  saveCheckoutShippingOptionsProcedure: actions
    .procedure("CheckoutAction.saveShippingOptions")
    .input(SaveCheckoutShippingOptionsForm)
    .output(CheckoutState)
    .error(SaveCheckoutShippingOptionsActionError)
    .mapInputIssues(checkoutShippingOptionsInputIssues)
    // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This is an Effect action error mapper, not Promise control flow.
    .mapError<CheckoutSaveShippingOptionsExpectedFailure>((error, { locale }) =>
      projectSaveCheckoutShippingOptionsFailure(error, locale)
    )
    .handle(saveCheckoutShippingOptionsProgram),
});
