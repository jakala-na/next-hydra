import { Effect, Result, Schema } from "effect";
import { CartId, type CartId as CartIdType } from "../domain/cart";
import type { CheckoutScope } from "../domain/checkout";
import { CheckoutSession } from "../lib/checkout/checkout-session";
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
  });

export type RunCheckoutSession = <A, E>(
  program: Effect.Effect<A, E, CheckoutSession>
) => Promise<A>;

export async function saveCheckoutContactForScope(
  scope: CheckoutScope,
  formData: FormData,
  run: RunCheckoutSession
): Promise<SaveCheckoutContactActionState> {
  const inputResult = await Effect.runPromise(
    Effect.result(getFormInput(formData))
  );

  if (Result.isFailure(inputResult)) {
    return invalidCheckoutContactFormState;
  }

  const saveResult = await run(
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
