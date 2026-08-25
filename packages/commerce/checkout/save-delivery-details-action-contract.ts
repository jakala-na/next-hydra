import { makeDisplayActionResultSchema } from "@repo/actions";

import { CheckoutState } from "../domain/checkout";
import { SaveCheckoutDeliveryDetailsPublicError } from "./public-errors";

/** This sentinel cannot decode as an AddressBookReference because `:` is forbidden there. */
export const MANUAL_DELIVERY_ADDRESS_CHOICE = "manual:";

export const SaveCheckoutDeliveryDetailsActionError =
  SaveCheckoutDeliveryDetailsPublicError;
export type SaveCheckoutDeliveryDetailsActionError =
  typeof SaveCheckoutDeliveryDetailsActionError.Type;

export const SaveCheckoutDeliveryDetailsActionResult =
  makeDisplayActionResultSchema(
    CheckoutState,
    SaveCheckoutDeliveryDetailsActionError
  );
export type SaveCheckoutDeliveryDetailsActionResult =
  typeof SaveCheckoutDeliveryDetailsActionResult.Encoded;
export type SaveCheckoutDeliveryDetailsActionFailure = Extract<
  typeof SaveCheckoutDeliveryDetailsActionResult.Type,
  { readonly _tag: "Failure" }
>["failure"];

export type SaveCheckoutDeliveryDetailsAction = (
  previousResult: SaveCheckoutDeliveryDetailsActionResult | null,
  formData: FormData
) => Promise<SaveCheckoutDeliveryDetailsActionResult>;
