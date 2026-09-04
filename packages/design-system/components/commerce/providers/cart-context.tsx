"use client";

import type {
  AddToCartAction,
  AddToCartInput,
} from "@repo/commerce/cart/add-to-cart";
import type { ChangeCartItemsQuantityAction } from "@repo/commerce/cart/change-cart-items-quantity";
import {
  cartPublicStateIdentity,
  decodeCartPublicState,
  isCartUnavailable,
} from "@repo/commerce/cart/public-state";
import type {
  CartProviderState,
  CartPublicState as CartPublicStateType,
  CartPublicStateEncoded,
  CartPublicStateIdentity,
} from "@repo/commerce/cart/public-state";
import type { RemoveCartItemAction } from "@repo/commerce/cart/remove-cart-item";
import { useTranslations } from "@repo/i18n";
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

type CartActions = {
  addToCart: AddToCartAction;
  changeCartItemsQuantity: ChangeCartItemsQuantityAction;
  removeCartItem: RemoveCartItemAction;
};

type CartContextType = {
  adoptedServerSnapshotIdentity?: CartPublicStateIdentity;
  adoptServerSnapshot: (cart: CartPublicStateType | null) => void;
  cartPromise: Promise<CartProviderState>;
  cart: CartPublicStateType | null | undefined;
  setCart: (cart: CartPublicStateEncoded | null) => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
  actions: CartActions;
};

const CartContext = createContext<CartContextType | null>(null);

type CartProviderProps = {
  children: ReactNode;
  cartPromise: Promise<CartProviderState>;
  actions: CartActions;
};

interface CartStoreState {
  readonly adoptedServerSnapshotIdentity?: CartPublicStateIdentity;
  readonly cart: CartPublicStateType | null | undefined;
}

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
  const [cartState, setCartState] = useState<CartStoreState>({
    cart: undefined,
  });
  const [isOpen, setIsOpen] = useState(false);

  const setCart = useCallback((cart: CartPublicStateEncoded | null) => {
    setCartState((current) => ({
      ...current,
      cart: cart === null ? null : decodeCartPublicState(cart),
    }));
  }, []);
  const adoptServerSnapshot = useCallback(
    (cart: CartPublicStateType | null) => {
      const identity = cartPublicStateIdentity(cart);
      setCartState((current) =>
        current.adoptedServerSnapshotIdentity === identity
          ? current
          : { adoptedServerSnapshotIdentity: identity, cart }
      );
    },
    []
  );

  const openCart = useCallback(() => {
    setIsOpen(true);
  }, []);
  const closeCart = useCallback(() => {
    setIsOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      actions,
      adoptServerSnapshot,
      adoptedServerSnapshotIdentity: cartState.adoptedServerSnapshotIdentity,
      cart: cartState.cart,
      cartPromise,
      closeCart,
      isOpen,
      openCart,
      setCart,
    }),
    [
      actions,
      adoptServerSnapshot,
      cartPromise,
      cartState,
      closeCart,
      isOpen,
      openCart,
      setCart,
    ]
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

  const {
    adoptedServerSnapshotIdentity,
    adoptServerSnapshot,
    cartPromise,
    cart,
  } = ctx;

  // Resolve promise - this causes suspension!
  const resolvedCart = use(cartPromise);
  const resolvedCartIsUnavailable = isCartUnavailable(resolvedCart);
  const resolvedIdentity = resolvedCartIsUnavailable
    ? undefined
    : cartPublicStateIdentity(resolvedCart);
  const isResolvedSnapshotAdopted =
    adoptedServerSnapshotIdentity === resolvedIdentity;

  useEffect(() => {
    if (!resolvedCartIsUnavailable && !isResolvedSnapshotAdopted) {
      adoptServerSnapshot(resolvedCart);
    }
  }, [
    adoptServerSnapshot,
    isResolvedSnapshotAdopted,
    resolvedCart,
    resolvedCartIsUnavailable,
  ]);

  return resolvedCartIsUnavailable || !isResolvedSnapshotAdopted
    ? resolvedCart
    : (cart ?? null);
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
 * A server-fresh snapshot seeds the provider-owned Cart state. The prop is
 * only a first-render fallback while that state is adopted.
 */
export function useCart(initialCart?: CartPublicStateType | null) {
  const ctx = useContext(CartContext);
  const t = useTranslations("web.cart");

  if (!ctx) {
    throw new Error("useCart must be used within CartProvider");
  }

  const {
    actions,
    adoptedServerSnapshotIdentity,
    adoptServerSnapshot,
    closeCart,
    isOpen,
    openCart,
    setCart,
  } = ctx;
  const initialCartIdentity =
    initialCart === undefined
      ? undefined
      : cartPublicStateIdentity(initialCart);
  const isInitialCartAdopted =
    initialCartIdentity === undefined ||
    adoptedServerSnapshotIdentity === initialCartIdentity;
  const currentCart = isInitialCartAdopted ? (ctx.cart ?? null) : initialCart;

  useEffect(() => {
    if (initialCart !== undefined && !isInitialCartAdopted) {
      adoptServerSnapshot(initialCart);
    }
  }, [adoptServerSnapshot, initialCart, isInitialCartAdopted]);

  const cart = currentCart?.cart ?? null;
  const violations = currentCart?.violations ?? [];
  const items = cart?.lineItems ?? [];
  const summary = cart?.summary;
  const totalItems = cart?.totalLineItemQuantity ?? 0;

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
    isOpen,
    items,
    openCart,
    removeItem,
    summary,
    totalItems,
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
