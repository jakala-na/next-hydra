import { makeDisplayActionResultSchema } from "@repo/actions";

import { SaveCheckoutShippingOptionsPublicError } from "./public-errors";
import { CheckoutPublicState } from "./public-state";

export const SaveCheckoutShippingOptionsActionError =
  SaveCheckoutShippingOptionsPublicError;
export type SaveCheckoutShippingOptionsActionError =
  typeof SaveCheckoutShippingOptionsActionError.Type;

export const SaveCheckoutShippingOptionsActionResult =
  makeDisplayActionResultSchema(
    CheckoutPublicState,
    SaveCheckoutShippingOptionsActionError
  );
export type SaveCheckoutShippingOptionsActionResult =
  typeof SaveCheckoutShippingOptionsActionResult.Encoded;

export type SaveCheckoutShippingOptionsAction = (
  previousResult: SaveCheckoutShippingOptionsActionResult | null,
  formData: FormData
) => Promise<SaveCheckoutShippingOptionsActionResult>;
