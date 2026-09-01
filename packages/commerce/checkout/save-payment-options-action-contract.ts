import { makeDisplayActionResultSchema } from "@repo/actions";

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

export type SaveCheckoutPaymentOptionsAction = (
  previousResult: SaveCheckoutPaymentOptionsActionResult | null,
  formData: FormData
) => Promise<SaveCheckoutPaymentOptionsActionResult>;
