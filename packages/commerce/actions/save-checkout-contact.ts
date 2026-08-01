import { Effect, Result, Schema } from "effect";
import { CartId, type CartId as CartIdType } from "../domain/cart";
import type { CheckoutScope } from "../domain/checkout";
import { CheckoutSession } from "../lib/checkout/checkout-session";
import { checkoutRuntimeLayerCommercetools } from "../lib/checkout/commercetools";
import { logUnexpectedCheckoutMutationFailure } from "./checkout-action-diagnostics";
import {
  checkoutContactNotFoundState,
  checkoutMutationFailureToActionState,
  invalidCheckoutContactFormState,
  type SaveCheckoutContactActionState,
  saveCheckoutContactActionSuccess,
} from "./save-checkout-contact-state";

const SaveCheckoutContactReferenceForm = {
  cartId: CartId,
  cartVersion: Schema.NumberFromString,
} as const;

const SaveCheckoutContactForm = Schema.Union([
  Schema.Struct({
    ...SaveCheckoutContactReferenceForm,
    source: Schema.Literal("manual"),
    email: Schema.String,
    firstName: Schema.String,
    lastName: Schema.String,
    phoneNumber: Schema.optional(Schema.String),
  }),
  Schema.Struct({
    ...SaveCheckoutContactReferenceForm,
    source: Schema.Literal("customerProfile"),
  }),
]);

type SaveCheckoutContactForm = typeof SaveCheckoutContactForm.Type;

const formString = (formData: FormData, name: string) => {
  const value = formData.get(name);
  return typeof value === "string" ? value : undefined;
};

const getFormInput = (formData: FormData) =>
  Schema.decodeUnknownEffect(SaveCheckoutContactForm)({
    cartId: formString(formData, "cartId"),
    cartVersion: formString(formData, "cartVersion"),
    source: formString(formData, "source"),
    email: formString(formData, "email"),
    firstName: formString(formData, "firstName"),
    lastName: formString(formData, "lastName"),
    phoneNumber: formString(formData, "phoneNumber") || undefined,
  });

const saveContact = (scope: CheckoutScope, input: SaveCheckoutContactForm) =>
  CheckoutSession.saveContact({
    scope,
    cart: {
      id: input.cartId as CartIdType,
      version: input.cartVersion,
    },
    contact:
      input.source === "customerProfile"
        ? { source: "customerProfile" }
        : {
            source: "manual",
            buyerContact: {
              email: input.email,
              firstName: input.firstName,
              lastName: input.lastName,
              ...(input.phoneNumber === undefined
                ? {}
                : { phoneNumber: input.phoneNumber }),
            },
          },
  }).pipe(Effect.provide(checkoutRuntimeLayerCommercetools));

export async function saveCheckoutContactForScope(
  scope: CheckoutScope,
  formData: FormData
): Promise<SaveCheckoutContactActionState> {
  const inputResult = await Effect.runPromise(
    Effect.result(getFormInput(formData))
  );

  if (Result.isFailure(inputResult)) {
    return invalidCheckoutContactFormState;
  }

  const saveResult = await Effect.runPromise(
    saveContact(scope, inputResult.success).pipe(
      Effect.tapError(logUnexpectedCheckoutMutationFailure),
      Effect.result
    )
  );

  if (Result.isFailure(saveResult)) {
    if (saveResult.failure._tag === "CheckoutUnavailable") {
      return checkoutContactNotFoundState;
    }

    return checkoutMutationFailureToActionState(saveResult.failure);
  }

  return saveCheckoutContactActionSuccess;
}
