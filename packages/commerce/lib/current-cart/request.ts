import type { Effect } from "effect";
import type { CartId } from "../../domain/cart";
import type { CurrentCartAssociationFailure } from "../../domain/cart-errors";
import type { CartStore } from "../../domain/cart-snapshot";
import type {
  CommerceBusinessUnitId,
  CommerceBusinessUnitKey,
  CommerceCustomerId,
} from "../../domain/commerce-account";

export interface AnonymousCurrentCartRequest {
  readonly _tag: "AnonymousCurrentCartRequest";
  readonly store: CartStore;
  readonly possessedCartId?: CartId;
  readonly establish: (
    id: CartId
  ) => Effect.Effect<void, CurrentCartAssociationFailure>;
  readonly clear: () => Effect.Effect<void, CurrentCartAssociationFailure>;
}

export interface BusinessUnitCurrentCartRequest {
  readonly _tag: "BusinessUnitCurrentCartRequest";
  readonly store: CartStore;
  readonly customerId: CommerceCustomerId;
  readonly businessUnitId: CommerceBusinessUnitId;
  readonly businessUnitKey: CommerceBusinessUnitKey;
}

export type CurrentCartRequest =
  | AnonymousCurrentCartRequest
  | BusinessUnitCurrentCartRequest;
