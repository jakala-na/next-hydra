import { makeDisplayActionResultSchema } from "@repo/actions";

import type { SaveCheckoutPaymentOptionsInput } from "../domain/checkout";
import { SaveCheckoutPaymentOptionsPublicError } from "./public-errors";
import { CheckoutPublicState } from "./public-state";

export const SaveCheckoutPaymentOptionsActionError =
  SaveCheckoutPaymentOptionsPublicError;
export type SaveCheckoutPaymentOptionsActionError =
  typeof SaveCheckoutPaymentOptionsActionError.Type;

export const SaveCheckoutPaymentOptionsActionResult =
  makeDisplayActionResultSchema(
    CheckoutPublicState,
    SaveCheckoutPaymentOptionsActionError
  );
export type SaveCheckoutPaymentOptionsActionResult =
  typeof SaveCheckoutPaymentOptionsActionResult.Encoded;
export type SaveCheckoutPaymentOptionsActionInput =
  typeof SaveCheckoutPaymentOptionsInput.Encoded;

export type SaveCheckoutPaymentOptionsAction = (
  previousResult: SaveCheckoutPaymentOptionsActionResult | null,
  input: SaveCheckoutPaymentOptionsActionInput
) => Promise<SaveCheckoutPaymentOptionsActionResult>;
