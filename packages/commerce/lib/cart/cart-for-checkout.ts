import { Effect, Schema } from "effect";
import {
  AnonymousId,
  CartForCheckout,
  type CartForCheckout as CartForCheckoutModel,
  CartId,
  CartMoney,
  LineItemId,
  ProductId,
  Sku,
  StoreKey,
  VariantId,
} from "../../domain/cart";
import { CommerceCustomerId } from "../../domain/commerce-account";

const CommerceCartLineItemForCheckout = Schema.Struct({
  id: LineItemId,
  productId: ProductId,
  name: Schema.optional(Schema.NullOr(Schema.String)),
  quantity: Schema.Number,
  totalPrice: Schema.NullOr(CartMoney),
  variant: Schema.NullOr(
    Schema.Struct({
      id: Schema.Number,
      sku: Schema.optional(Sku),
    })
  ),
});

const CommerceCartForCheckout = Schema.Struct({
  id: CartId,
  version: Schema.Number,
  customerId: Schema.optional(CommerceCustomerId),
  anonymousId: Schema.optional(AnonymousId),
  store: Schema.optional(
    Schema.NullOr(
      Schema.Struct({
        key: Schema.NullOr(StoreKey),
      })
    )
  ),
  lineItems: Schema.Array(CommerceCartLineItemForCheckout),
  totalLineItemQuantity: Schema.Number,
  totalPrice: CartMoney,
});

type CommerceCartForCheckout = typeof CommerceCartForCheckout.Type;

const toCartForCheckout = (
  cart: CommerceCartForCheckout
): CartForCheckoutModel => ({
  id: cart.id,
  version: cart.version,
  ...(cart.customerId === undefined ? {} : { customerId: cart.customerId }),
  ...(cart.anonymousId === undefined ? {} : { anonymousId: cart.anonymousId }),
  ...(cart.store?.key == null ? {} : { storeKey: cart.store.key }),
  lineItems: cart.lineItems.map((lineItem) => ({
    id: lineItem.id,
    productId: lineItem.productId,
    ...(lineItem.name == null ? {} : { name: lineItem.name }),
    quantity: lineItem.quantity,
    totalPrice: lineItem.totalPrice,
    ...(lineItem.variant === null
      ? {}
      : {
          variant: {
            id: VariantId.make(String(lineItem.variant.id)),
            ...(lineItem.variant.sku === undefined
              ? {}
              : { sku: lineItem.variant.sku }),
          },
        }),
  })),
  totalLineItemQuantity: cart.totalLineItemQuantity,
  totalPrice: cart.totalPrice,
});

export const decodeCartForCheckout = (cart: unknown) =>
  Schema.decodeUnknownEffect(CommerceCartForCheckout)(cart).pipe(
    Effect.flatMap((decoded) =>
      Schema.decodeUnknownEffect(CartForCheckout)(toCartForCheckout(decoded))
    )
  );
