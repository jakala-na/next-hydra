import { makeDisplayActionResultSchema } from "@repo/actions";

import { OrderPlacementResult } from "../domain/order";
import { PlaceCheckoutOrderPublicError } from "./public-errors";

export const PlaceCheckoutOrderActionError = PlaceCheckoutOrderPublicError;
export type PlaceCheckoutOrderActionError =
  typeof PlaceCheckoutOrderActionError.Type;

export const PlaceCheckoutOrderActionResult = makeDisplayActionResultSchema(
  OrderPlacementResult,
  PlaceCheckoutOrderActionError
);
export type PlaceCheckoutOrderActionResult =
  typeof PlaceCheckoutOrderActionResult.Encoded;

export type PlaceCheckoutOrderAction = (
  previousResult: PlaceCheckoutOrderActionResult | null,
  formData: FormData
) => Promise<PlaceCheckoutOrderActionResult>;
