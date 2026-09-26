import { CommerceCartProvider } from "@repo/commerce/cart";
import { getLocale } from "@repo/i18n";
import type { ReactNode } from "react";

import {
  addToCart,
  changeCartItemsQuantity,
  removeCartItem,
} from "@/lib/cart-actions";

export async function CommerceProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const locale = await getLocale();
  return (
    <CommerceCartProvider
      actions={{ addToCart, changeCartItemsQuantity, removeCartItem }}
      locale={locale}
    >
      {children}
    </CommerceCartProvider>
  );
}
