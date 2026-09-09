import "server-only";
import { HeaderCommerceRuntime } from "@repo/commerce/runtime/header-runtime";
import { CartProvider } from "@repo/design-system/components/commerce/providers/cart-context";
import type { Locale } from "@repo/i18n/types";
import { Effect, Option } from "effect";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";

import { CurrentCart } from "../services/current-cart";
import type { AddToCartAction } from "./add-to-cart";
import type { ChangeCartItemsQuantityAction } from "./change-cart-items-quantity";
import { toCartPublicState } from "./public-state";
import type { RemoveCartItemAction } from "./remove-cart-item";

const loadCurrentCart = async (locale: Locale) => {
  await connection();

  try {
    const cart = await HeaderCommerceRuntime.run(
      locale,
      CurrentCart.get().pipe(
        Effect.tapError((error) =>
          Effect.logError("Failed to read Current Cart", error).pipe(
            Effect.annotateLogs({ operation: "currentCart.get" })
          )
        )
      )
    );
    return Option.match(cart, {
      onNone: () => null,
      onSome: toCartPublicState,
    });
  } catch (error) {
    unstable_rethrow(error);
    await Effect.runPromise(
      Effect.logError("Failed to read Current Cart", error).pipe(
        Effect.annotateLogs({ operation: "currentCart.get" })
      )
    );
    return null;
  }
};

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
    <CartProvider actions={actions} cartPromise={loadCurrentCart(locale)}>
      {children}
    </CartProvider>
  );
}
