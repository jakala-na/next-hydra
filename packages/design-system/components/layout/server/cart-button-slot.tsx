import { use } from "react";
import { CartButtonClient } from "../cart-button";
import type { CartSummaryProps } from "../site-header";

export function CartSlot({
  cartPromise,
}: {
  cartPromise: Promise<CartSummaryProps>;
}) {
  const cart = use(cartPromise);
  return <CartButtonClient {...cart} />;
}
