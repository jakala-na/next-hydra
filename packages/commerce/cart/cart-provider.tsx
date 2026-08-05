import "server-only";

import { CartProvider } from "@repo/design-system/components/commerce/providers/cart-context";
import type { Locale } from "@repo/i18n/types";
import { Effect, Option } from "effect";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";
import type { ReactNode } from "react";
import { commerceRequestLayer } from "../commerce-context/request";
import { CurrentCart } from "../services/current-cart";
import { addToCart, changeCartItemsQuantity, removeCartItem } from "./actions";

const loadCurrentCart = async (locale: Locale) => {
  await connection();

  try {
    const layer = await commerceRequestLayer(locale);
    const cart = await Effect.runPromise(
      CurrentCart.get().pipe(
        Effect.provide(layer),
        Effect.tapError((error) =>
          Effect.logError("Failed to read Current Cart", error).pipe(
            Effect.annotateLogs({ operation: "currentCart.get" })
          )
        )
      )
    );
    return Option.match(cart, {
      onNone: () => null,
      onSome: (state) => state,
    });
  } catch (cause) {
    unstable_rethrow(cause);
    await Effect.runPromise(
      Effect.logError("Failed to read Current Cart", cause).pipe(
        Effect.annotateLogs({ operation: "currentCart.get" })
      )
    );
    return null;
  }
};

interface CommerceCartProviderProps {
  readonly children: ReactNode;
  readonly locale: Locale;
}

export function CommerceCartProvider({
  children,
  locale,
}: CommerceCartProviderProps) {
  return (
    <CartProvider
      actions={{ addToCart, changeCartItemsQuantity, removeCartItem }}
      cartPromise={loadCurrentCart(locale)}
    >
      {children}
    </CartProvider>
  );
}
