"use client";

import type {
  AddToCartAction,
  AddToCartInput,
} from "@repo/commerce/contracts/actions/add-to-cart";
import type { ChangeCartItemsQuantityAction } from "@repo/commerce/contracts/actions/change-cart-items-quantity";
import type { RemoveCartItemAction } from "@repo/commerce/contracts/actions/remove-cart-item";
import type { CartWithIssues } from "@repo/commerce/lib/cart/types";
import type { Cart, LineItem } from "@repo/commerce/lib/types";
import type { ActionResult } from "@repo/commerce/lib/utils/errors";
import { useTranslations } from "@repo/i18n";
import type { CurrencyCode } from "@repo/i18n/types";
import {
  createContext,
  type ReactNode,
  use,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

const CENTS_PER_UNIT = 100 as const;

type CartActions = {
  addToCart: AddToCartAction;
  changeCartItemsQuantity: ChangeCartItemsQuantityAction;
  removeCartItem: RemoveCartItemAction;
};

type CartContextType = {
  cartPromise: Promise<ActionResult<CartWithIssues>>;
  cart: CartWithIssues | null;
  setCart: (cart: CartWithIssues | null) => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  actions: CartActions;
};

const CartContext = createContext<CartContextType | null>(null);

type CartProviderProps = {
  children: ReactNode;
  cartPromise: Promise<ActionResult<CartWithIssues>>;
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
  const [cart, setCart] = useState<CartWithIssues | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const openCart = useCallback(() => setIsOpen(true), []);
  const closeCart = useCallback(() => setIsOpen(false), []);

  const value = useMemo(
    () => ({
      cartPromise,
      cart,
      setCart,
      isOpen,
      openCart,
      closeCart,
      actions,
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
  const result = use(cartPromise);
  const resolvedCart = result?.ok ? (result.data ?? null) : null;

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
    isOpen: ctx.isOpen,
    openCart: ctx.openCart,
    closeCart: ctx.closeCart,
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
    cart: cartWithIssues,
    setCart,
    isOpen,
    openCart,
    closeCart,
    actions,
  } = ctx;
  const cart: Cart | null = cartWithIssues?.cart ?? null;
  const currencyCode: CurrencyCode = cartWithIssues?.currency ?? "USD";

  const items = useMemo(() => {
    const lineItems = cart?.lineItems ?? [];
    return lineItems.map((li: LineItem) => {
      const { id, name, quantity, price, variant } = li;
      const image = variant?.images?.[0]?.url ?? "";

      return {
        id,
        name: name || "",
        variant: "",
        price: price.value.centAmount / CENTS_PER_UNIT,
        quantity,
        image,
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
      if (result?.data?.ok && result.data.data) {
        setCart(result.data.data);
        openCart();
        toast.success(t("toast.addedToCart"));
      } else {
        toast.error(t("toast.failedToAdd"));
      }
    },
    [actions, setCart, openCart, t]
  );

  const removeItem = useCallback(
    async (id: string) => {
      const result = await actions.removeCartItem({ lineItemId: id });
      if (result?.data?.ok && result.data.data) {
        setCart(result.data.data);
        toast.success(t("toast.removedFromCart"));
      } else {
        toast.error(t("toast.failedToRemove"));
      }
    },
    [actions, setCart, t]
  );

  const updateQuantity = useCallback(
    async (id: string, quantity: number) => {
      const result = await actions.changeCartItemsQuantity({
        lineItemId: id,
        quantity,
      });
      if (result?.data?.ok && result.data.data) {
        setCart(result.data.data);
        toast.success(t("toast.updatedQuantity"));
      } else {
        toast.error(t("toast.failedToUpdate"));
      }
    },
    [actions, setCart, t]
  );

  return {
    items,
    totalItems,
    totalPrice,
    currencyCode,
    addItem,
    removeItem,
    updateQuantity,
    isOpen,
    openCart,
    closeCart,
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
      if (result?.data?.ok && result.data.data) {
        setCart(result.data.data);
        openCart();
        toast.success(t("toast.addedToCart"));
      } else {
        toast.error(t("toast.failedToAdd"));
      }
    },
    [actions, setCart, openCart, t]
  );

  return { isOpen, openCart, closeCart, addItem };
}
