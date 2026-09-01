import { makeDisplayActionResultSchema } from "@repo/actions";

import { CheckoutState } from "../domain/checkout";
import { SaveCheckoutShippingOptionsPublicError } from "./public-errors";

export const SaveCheckoutShippingOptionsActionError =
  SaveCheckoutShippingOptionsPublicError;
export type SaveCheckoutShippingOptionsActionError =
  typeof SaveCheckoutShippingOptionsActionError.Type;

export const SaveCheckoutShippingOptionsActionResult =
  makeDisplayActionResultSchema(
    CheckoutState,
    SaveCheckoutShippingOptionsActionError
  );
export type SaveCheckoutShippingOptionsActionResult =
  typeof SaveCheckoutShippingOptionsActionResult.Encoded;

export type SaveCheckoutShippingOptionsAction = (
  previousResult: SaveCheckoutShippingOptionsActionResult | null,
  formData: FormData
) => Promise<SaveCheckoutShippingOptionsActionResult>;
