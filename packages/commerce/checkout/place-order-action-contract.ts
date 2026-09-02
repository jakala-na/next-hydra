import { makeDisplayActionResultSchema } from "@repo/actions";

import type { PlaceCheckoutOrderInput } from "../domain/checkout";
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
export type PlaceCheckoutOrderActionInput =
  typeof PlaceCheckoutOrderInput.Encoded;

export type PlaceCheckoutOrderAction = (
  previousResult: PlaceCheckoutOrderActionResult | null,
  input: PlaceCheckoutOrderActionInput
) => Promise<PlaceCheckoutOrderActionResult>;
