"use client";

import type {
  AddToCartAction,
  AddToCartInput,
} from "@repo/commerce/cart/add-to-cart";
import type { ChangeCartItemsQuantityAction } from "@repo/commerce/cart/change-cart-items-quantity";
import type { RemoveCartItemAction } from "@repo/commerce/cart/remove-cart-item";
import type {
  CartLineItemEncoded,
  CurrentCartStateEncoded,
} from "@repo/commerce/domain/cart-snapshot";
import { useTranslations } from "@repo/i18n";
import type { CurrencyCode } from "@repo/i18n/types";
import {
  createContext,
  use,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { ReactNode } from "react";
import { toast } from "sonner";

const CENTS_PER_UNIT = 100 as const;

type CartActions = {
  addToCart: AddToCartAction;
  changeCartItemsQuantity: ChangeCartItemsQuantityAction;
  removeCartItem: RemoveCartItemAction;
};

type CartContextType = {
  cartPromise: Promise<CurrentCartStateEncoded | null>;
  cart: CurrentCartStateEncoded | null;
  setCart: (cart: CurrentCartStateEncoded | null) => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  actions: CartActions;
};

const CartContext = createContext<CartContextType | null>(null);

type CartProviderProps = {
  children: ReactNode;
  cartPromise: Promise<CurrentCartStateEncoded | null>;
  actions: CartActions;
};

/**
 * CartProvider - stores cart promise without resolving it.
 * - Promise is passed through context, NOT resolved here
 * - Leaf components call use() inside their own Suspense boundaries
 * - Shared state is updated when cart data is resolved or after actions
 */
export function CartProvider({
  children,
  cartPromise,
  actions,
}: CartProviderProps) {
  const [cart, setCart] = useState<CurrentCartStateEncoded | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openCart = useCallback(() => {
    setIsOpen(true);
  }, []);
  const closeCart = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      actions,
      cart,
      cartPromise,
      closeCart,
      isOpen,
      openCart,
      setCart,
    }),
    [cartPromise, cart, isOpen, openCart, closeCart, actions]
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

/**
 * useCartData - resolves cart promise and syncs to shared state.
 * IMPORTANT: Components using this hook MUST be wrapped in Suspense!
 * This hook causes suspension until the cart promise resolves.
 */
export function useCartData() {
  const ctx = useContext(CartContext);

  if (!ctx) {
    throw new Error("useCartData must be used within CartProvider");
  }

  const { cartPromise, cart, setCart } = ctx;

  // Resolve promise - this causes suspension!
  const resolvedCart = use(cartPromise);

  // Sync resolved cart to shared state on first resolve
  useEffect(() => {
    if (resolvedCart && !cart) {
      setCart(resolvedCart);
    }
  }, [resolvedCart, cart, setCart]);

  // Return shared state if available, otherwise the freshly resolved cart
  return cart ?? resolvedCart;
}

/**
 * useCartState - access cart UI state (open/close) without resolving promise.
 * Safe to use anywhere - does NOT cause suspension.
 */
export function useCartState() {
  const ctx = useContext(CartContext);

  if (!ctx) {
    throw new Error("useCartState must be used within CartProvider");
  }

  return {
    closeCart: ctx.closeCart,
    isOpen: ctx.isOpen,
    openCart: ctx.openCart,
  };
}

/**
 * useCart - access cart data and mutation functions.
 * Uses shared state (already resolved by useCartData).
 * Does NOT cause suspension - cart should already be in state.
 */
export function useCart() {
  const ctx = useContext(CartContext);
  const t = useTranslations("web.cart");

  if (!ctx) {
    throw new Error("useCart must be used within CartProvider");
  }

  const {
    cart: currentCart,
    setCart,
    isOpen,
    openCart,
    closeCart,
    actions,
  } = ctx;
  const cart = currentCart?.cart ?? null;
  const currencyCode: CurrencyCode =
    (cart?.totalPrice.currencyCode as CurrencyCode | undefined) ?? "USD";
  const violations = currentCart?.violations ?? [];

  const items = useMemo(() => {
    const lineItems = cart?.lineItems ?? [];
    return lineItems.map((lineItem: CartLineItemEncoded) => {
      const { id, quantity, unitPrice, variant } = lineItem;
      const image = variant.images[0]?.url ?? "";

      return {
        id,
        image,
        name: variant.name ?? "",
        price: unitPrice.centAmount / CENTS_PER_UNIT,
        quantity,
        variant: "",
      };
    });
  }, [cart]);

  const totalItems = useMemo(() => {
    let sum = 0;
    for (const i of items) {
      sum += i.quantity;
    }
    return sum;
  }, [items]);

  const totalPrice = useMemo(() => {
    let sum = 0;
    for (const i of items) {
      sum += i.price * i.quantity;
    }
    return sum;
  }, [items]);

  const addItem = useCallback(
    async (input: AddToCartInput) => {
      const result = await actions.addToCart(input);
      if (result._tag === "Failure") {
        toast.error(t("toast.failedToAdd"));
        return;
      }
      setCart(result.success);
      openCart();
      toast.success(t("toast.addedToCart"));
    },
    [actions, setCart, openCart, t]
  );

  const removeItem = useCallback(
    async (id: string) => {
      const result = await actions.removeCartItem({ lineItemId: id });
      if (result._tag === "Failure") {
        toast.error(t("toast.failedToRemove"));
        return;
      }
      setCart(result.success);
      toast.success(t("toast.removedFromCart"));
    },
    [actions, setCart, t]
  );

  const updateQuantity = useCallback(
    async (id: string, quantity: number) => {
      const result = await actions.changeCartItemsQuantity({
        lineItemId: id,
        quantity,
      });
      if (result._tag === "Failure") {
        toast.error(t("toast.failedToUpdate"));
        return;
      }
      setCart(result.success);
      toast.success(t("toast.updatedQuantity"));
    },
    [actions, setCart, t]
  );

  return {
    addItem,
    closeCart,
    currencyCode,
    isOpen,
    items,
    openCart,
    removeItem,
    totalItems,
    totalPrice,
    updateQuantity,
    violations,
  };
}

/**
 * useCartActions - access cart actions without needing cart data.
 * Safe to use anywhere - for components that only need to add items.
 * Does NOT cause suspension.
 */
export function useCartActions() {
  const ctx = useContext(CartContext);
  const t = useTranslations("web.cart");

  if (!ctx) {
    throw new Error("useCartActions must be used within CartProvider");
  }

  const { setCart, isOpen, openCart, closeCart, actions } = ctx;

  const addItem = useCallback(
    async (input: AddToCartInput) => {
      const result = await actions.addToCart(input);
      if (result._tag === "Failure") {
        toast.error(t("toast.failedToAdd"));
        return;
      }
      setCart(result.success);
      openCart();
      toast.success(t("toast.addedToCart"));
    },
    [actions, setCart, openCart, t]
  );

  return { addItem, closeCart, isOpen, openCart };
}
