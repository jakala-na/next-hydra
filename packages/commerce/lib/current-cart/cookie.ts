import type { Effect } from "effect";
import type { CartId } from "../../domain/cart";
import type { CurrentCartOperationFailure } from "../../domain/cart-errors";

export interface CurrentCartCookie {
  readonly set: (
    id: CartId
  ) => Effect.Effect<void, CurrentCartOperationFailure>;
  readonly clear: () => Effect.Effect<void>;
}
