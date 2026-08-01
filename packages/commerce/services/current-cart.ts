import { Context, type Effect, type Option } from "effect";
import type {
  LineItemId,
  PositiveCartQuantity,
  ProductId,
  VariantId,
} from "../domain/cart";
import type {
  CartLineItemNotFound,
  CartMerchandiseUnavailable,
  CartPolicyFailure,
  CartProviderFailure,
  CartWriteConflict,
  CartWriteOutcomeUnknown,
  CurrentCartAssociationFailure,
  CurrentCartSelectionConflict,
  CurrentCartUnavailable,
} from "../domain/cart-errors";
import type { CurrentCartState } from "../domain/cart-snapshot";
import type {
  CheckoutContact,
  CheckoutDeliveryDetails,
} from "../domain/checkout";

export interface AddCurrentCartItem {
  readonly productId: ProductId;
  readonly variantId: VariantId;
  readonly quantity: PositiveCartQuantity;
}

export interface SetCurrentCartLineItemQuantity {
  readonly lineItemId: LineItemId;
  readonly quantity: PositiveCartQuantity;
}

export interface RemoveCurrentCartLineItem {
  readonly lineItemId: LineItemId;
}

export type CurrentCartReadFailure =
  | CurrentCartSelectionConflict
  | CurrentCartAssociationFailure
  | CartProviderFailure
  | CartPolicyFailure;

export type AddCurrentCartItemFailure =
  | CurrentCartUnavailable
  | CartMerchandiseUnavailable
  | CartWriteConflict
  | CartWriteOutcomeUnknown
  | CurrentCartAssociationFailure
  | CartProviderFailure
  | CartPolicyFailure;

export type SetCurrentCartLineItemQuantityFailure =
  | CurrentCartUnavailable
  | CartLineItemNotFound
  | CartWriteConflict
  | CartProviderFailure
  | CartPolicyFailure;

export type RemoveCurrentCartLineItemFailure =
  SetCurrentCartLineItemQuantityFailure;

export type SaveCurrentCartDetailsFailure =
  | CurrentCartUnavailable
  | CartWriteConflict
  | CartProviderFailure
  | CartPolicyFailure;

export class CurrentCart extends Context.Service<
  CurrentCart,
  {
    readonly get: () => Effect.Effect<
      Option.Option<CurrentCartState>,
      CurrentCartReadFailure
    >;
    readonly addItem: (
      input: AddCurrentCartItem
    ) => Effect.Effect<CurrentCartState, AddCurrentCartItemFailure>;
    readonly setLineItemQuantity: (
      input: SetCurrentCartLineItemQuantity
    ) => Effect.Effect<CurrentCartState, SetCurrentCartLineItemQuantityFailure>;
    readonly removeLineItem: (
      input: RemoveCurrentCartLineItem
    ) => Effect.Effect<CurrentCartState, RemoveCurrentCartLineItemFailure>;
    readonly saveContact: (
      contact: CheckoutContact
    ) => Effect.Effect<CurrentCartState, SaveCurrentCartDetailsFailure>;
    readonly saveDeliveryDetails: (
      details: CheckoutDeliveryDetails
    ) => Effect.Effect<CurrentCartState, SaveCurrentCartDetailsFailure>;
  }
>()("@repo/commerce/CurrentCart") {}
