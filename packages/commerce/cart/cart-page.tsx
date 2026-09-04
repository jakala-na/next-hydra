import "server-only";
import { CartPageView } from "@repo/design-system/components/commerce/blocks/cart-page";
import type { Locale } from "@repo/i18n/types";

import { loadCurrentCart } from "./cart-provider";
import { cartPublicStateIdentity } from "./public-state";

interface CartPageProps {
  readonly locale: Locale;
}

export async function CartPage({ locale }: CartPageProps) {
  const initialCart = await loadCurrentCart(locale);
  const cartKey = cartPublicStateIdentity(initialCart);
  return <CartPageView initialCart={initialCart} key={cartKey} />;
}
