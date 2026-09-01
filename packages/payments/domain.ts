import { Schema } from "effect";

export const PaymentAmount = Schema.Struct({
  centAmount: Schema.Int,
  currencyCode: Schema.String.check(Schema.isPattern(/^[A-Z]{3}$/u)),
});
export type PaymentAmount = typeof PaymentAmount.Type;

export const PaymentBillingAddress = Schema.Struct({
  addressLine1: Schema.String,
  addressLine2: Schema.optional(Schema.String),
  city: Schema.String,
  country: Schema.String.check(Schema.isPattern(/^[A-Z]{2}$/u)),
  postalCode: Schema.String,
  region: Schema.optional(Schema.String),
});
export type PaymentBillingAddress = typeof PaymentBillingAddress.Type;

export const PaymentMethod = Schema.Literals(["card", "netTerms"]);
export type PaymentMethod = typeof PaymentMethod.Type;

export const PaymentCheckoutReference = Schema.String.pipe(
  Schema.brand("PaymentCheckoutReference")
);
export type PaymentCheckoutReference = typeof PaymentCheckoutReference.Type;

export const PaymentAccountReference = Schema.String.pipe(
  Schema.brand("PaymentAccountReference")
);
export type PaymentAccountReference = typeof PaymentAccountReference.Type;

export const PaymentReference = Schema.String.pipe(
  Schema.brand("PaymentReference")
);
export type PaymentReference = typeof PaymentReference.Type;

export const PaymentProviderReference = Schema.String.pipe(
  Schema.brand("PaymentProviderReference")
);
export type PaymentProviderReference = typeof PaymentProviderReference.Type;

export const PaymentProvider = Schema.NonEmptyString.pipe(
  Schema.brand("PaymentProvider")
);
export type PaymentProvider = typeof PaymentProvider.Type;

export const PreparedPaymentReference = Schema.String.pipe(
  Schema.brand("PreparedPaymentReference")
);
export type PreparedPaymentReference = typeof PreparedPaymentReference.Type;

export const PaymentConfirmationReference = Schema.String.pipe(
  Schema.brand("PaymentConfirmationReference")
);
export type PaymentConfirmationReference =
  typeof PaymentConfirmationReference.Type;

export const PaymentCheckout = Schema.Struct({
  amount: PaymentAmount,
  reference: PaymentCheckoutReference,
});
export type PaymentCheckout = typeof PaymentCheckout.Type;

const cardPreparationPrefix = (checkout: PaymentCheckout) =>
  `checkout-card-${checkout.reference}:`;

export const cardPreparationReferenceFor = (checkout: PaymentCheckout) =>
  PreparedPaymentReference.make(
    `${cardPreparationPrefix(checkout)}${checkout.amount.currencyCode}:${checkout.amount.centAmount}`
  );

export const cardPreparationBelongsToCheckout = (
  checkout: PaymentCheckout,
  preparationReference: PreparedPaymentReference
) => preparationReference.startsWith(cardPreparationPrefix(checkout));

/** Client-safe values produced by the configured Card Payments adapter. */
export const CardPaymentClientIntegration = Schema.Struct({
  clientToken: Schema.String,
  provider: PaymentProvider,
  publicConfiguration: Schema.String,
});
export type CardPaymentClientIntegration =
  typeof CardPaymentClientIntegration.Type;

export const CardPaymentInput = Schema.Struct({
  clientIntegration: CardPaymentClientIntegration,
  preparationReference: PreparedPaymentReference,
});
export type CardPaymentInput = typeof CardPaymentInput.Type;

export const CardPaymentOption = Schema.Struct({
  availability: Schema.Literal("available"),
  displayName: Schema.String,
  input: CardPaymentInput,
  method: Schema.Literal("card"),
});
export type CardPaymentOption = typeof CardPaymentOption.Type;

const NetTermsPaymentOptionFields = {
  availableCredit: PaymentAmount,
  displayName: Schema.String,
  method: Schema.Literal("netTerms"),
  termsInDays: Schema.Int.check(Schema.isGreaterThan(0)),
};

export const NetTermsPaymentOption = Schema.Union([
  Schema.Struct({
    ...NetTermsPaymentOptionFields,
    availability: Schema.Literal("available"),
  }),
  Schema.Struct({
    ...NetTermsPaymentOptionFields,
    availability: Schema.Literal("unavailable"),
    unavailableReason: Schema.Literal("insufficientAvailableCredit"),
  }),
]);
export type NetTermsPaymentOption = typeof NetTermsPaymentOption.Type;

export const PaymentMethodOption = Schema.Union([
  CardPaymentOption,
  NetTermsPaymentOption,
]);
export type PaymentMethodOption = typeof PaymentMethodOption.Type;

export const PreparedCardPayment = Schema.Struct({
  amount: PaymentAmount,
  billingAddress: PaymentBillingAddress,
  confirmationReference: Schema.optional(PaymentConfirmationReference),
  method: Schema.Literal("card"),
  paymentReference: PaymentReference,
  preparationReference: PreparedPaymentReference,
});
export type PreparedCardPayment = typeof PreparedCardPayment.Type;

export const PreparedNetTermsPayment = Schema.Struct({
  amount: PaymentAmount,
  billingAddress: PaymentBillingAddress,
  method: Schema.Literal("netTerms"),
  paymentReference: PaymentReference,
  termsInDays: Schema.Int.check(Schema.isGreaterThan(0)),
});
export type PreparedNetTermsPayment = typeof PreparedNetTermsPayment.Type;

export const PreparedPayment = Schema.Union([
  PreparedCardPayment,
  PreparedNetTermsPayment,
]);
export type PreparedPayment = typeof PreparedPayment.Type;

export const PaymentOptions = Schema.Struct({
  amount: PaymentAmount,
  methods: Schema.Array(PaymentMethodOption),
});
export type PaymentOptions = typeof PaymentOptions.Type;

export const CardPaymentSelection = Schema.Struct({
  confirmationReference: Schema.optional(PaymentConfirmationReference),
  method: Schema.Literal("card"),
  preparationReference: PreparedPaymentReference,
});
export type CardPaymentSelection = typeof CardPaymentSelection.Type;

export const NetTermsPaymentSelection = Schema.Struct({
  method: Schema.Literal("netTerms"),
});
export type NetTermsPaymentSelection = typeof NetTermsPaymentSelection.Type;

export const PaymentSelection = Schema.Union([
  CardPaymentSelection,
  NetTermsPaymentSelection,
]);
export type PaymentSelection = typeof PaymentSelection.Type;

export const CheckoutPaymentBuyer = Schema.Union([
  Schema.Struct({ type: Schema.Literal("guest") }),
  Schema.Struct({
    accountReference: PaymentAccountReference,
    type: Schema.Literal("company"),
  }),
]);
export type CheckoutPaymentBuyer = typeof CheckoutPaymentBuyer.Type;

export class PaymentMethodUnavailable extends Schema.TaggedError<PaymentMethodUnavailable>()(
  "PaymentMethodUnavailable",
  {
    availableCredit: Schema.optional(PaymentAmount),
    method: PaymentMethod,
    reason: Schema.Literals(["insufficientAvailableCredit", "notEligible"]),
  }
) {}

export class PaymentPreparationUnavailable extends Schema.TaggedError<PaymentPreparationUnavailable>()(
  "PaymentPreparationUnavailable",
  {
    checkoutReference: PaymentCheckoutReference,
    preparationReference: PreparedPaymentReference,
    reason: Schema.Literals([
      "notFound",
      "amountChanged",
      "confirmationUnavailable",
    ]),
  }
) {}

export const PaymentConfirmationUnavailableReason = Schema.Literals([
  "notFound",
  "expired",
  "alreadyUsed",
  "unsupportedPaymentMethod",
]);
export type PaymentConfirmationUnavailableReason =
  typeof PaymentConfirmationUnavailableReason.Type;

export class PaymentConfirmationUnavailable extends Schema.TaggedError<PaymentConfirmationUnavailable>()(
  "PaymentConfirmationUnavailable",
  {
    confirmationReference: PaymentConfirmationReference,
    reason: PaymentConfirmationUnavailableReason,
  }
) {}

export const PaymentProviderFailureReason = Schema.Literals([
  "unavailable",
  "invalidData",
  "unexpectedResponse",
]);
export type PaymentProviderFailureReason =
  typeof PaymentProviderFailureReason.Type;

export class PaymentProviderFailure extends Schema.TaggedError<PaymentProviderFailure>()(
  "PaymentProviderFailure",
  {
    cause: Schema.optional(Schema.Defect()),
    operation: Schema.String,
    reason: PaymentProviderFailureReason,
  }
) {}
