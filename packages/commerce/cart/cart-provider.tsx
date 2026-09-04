import "server-only";
import { NextCommerce } from "@repo/commerce/runtime";
import { CartProvider } from "@repo/design-system/components/commerce/providers/cart-context";
import type { Locale } from "@repo/i18n/types";
import { Effect, Option } from "effect";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { CurrentCart } from "../services/current-cart";
import type { AddToCartAction } from "./add-to-cart";
import type { ChangeCartItemsQuantityAction } from "./change-cart-items-quantity";
import { projectCurrentCartProviderOutage } from "./current-cart-read-policy";
import type { CartProviderState, CartPublicState } from "./public-state";
import { toCartPublicState } from "./public-state";
import type { RemoveCartItemAction } from "./remove-cart-item";

const toPublicCart = Option.match({
  onNone: () => null,
  onSome: toCartPublicState,
});

export async function loadCurrentCart(
  locale: Locale
): Promise<CartPublicState | null> {
  await connection();
  return await NextCommerce.runPromise(
    CurrentCart.get().pipe(
      Effect.map(toPublicCart),
      NextCommerce.provide(locale)
    )
  );
}

async function loadCurrentCartForSharedLayout(
  locale: Locale
): Promise<CartProviderState> {
  await connection();
  return await NextCommerce.runPromise(
    CurrentCart.get().pipe(
      Effect.map(toPublicCart),
      projectCurrentCartProviderOutage,
      NextCommerce.provide(locale)
    )
  );
}

interface CommerceCartProviderProps {
  readonly actions: {
    readonly addToCart: AddToCartAction;
    readonly changeCartItemsQuantity: ChangeCartItemsQuantityAction;
    readonly removeCartItem: RemoveCartItemAction;
  };
  readonly children: ReactNode;
  readonly locale: Locale;
}

export function CommerceCartProvider({
  actions,
  children,
  locale,
}: CommerceCartProviderProps) {
  return (
    <CartProvider
      actions={actions}
      cartPromise={loadCurrentCartForSharedLayout(locale)}
    >
      {children}
    </CartProvider>
  );
}
