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
  useMemo,
  useState,
} from "react";
import { toast } from "sonner";

const CENTS_PER_UNIT = 100 as const;

export type CartItem = {
  id: string;
  productId?: number;
  name: string;
  variant: string;
  price: number;
  quantity: number;
  image: string;
};

type CartContextType = {
  items: CartItem[];
  totalItems: number;
  totalPrice: number;
  currencyCode: CurrencyCode;
  addItem: (item: AddToCartInput) => Promise<void>;
  removeItem: (id: string) => void;
  updateQuantity: (id: string, quantity: number) => void;
  isOpen: boolean;
  openCart: () => void;
  closeCart: () => void;
};

const CartContext = createContext<CartContextType | undefined>(undefined);

type CartActions = {
  addToCart: AddToCartAction;
  changeCartItemsQuantity: ChangeCartItemsQuantityAction;
  removeCartItem: RemoveCartItemAction;
};

type CartProviderProps = {
  children: ReactNode;
  cartPromise: Promise<ActionResult<CartWithIssues>>;
  actions: CartActions;
};

export function CartProvider({
  children,
  // cartPromise,
  actions,
}: CartProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const t = useTranslations("web.cart");
  // const initialCart = use(cartPromise);
  // const initialCartWithIssues = initialCart?.ok
  //   ? (initialCart.data ?? null)
  //   : null;
  const [cartWithIssues, setCartWithIssues] = useState<CartWithIssues | null>(
    null // initialCartWithIssues ?? null
  );

  const cart: Cart | null = cartWithIssues?.cart ?? null;
  const currencyCode = cartWithIssues?.currency ?? "USD";
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

  const removeItem = useCallback(
    async (id: string) => {
      const newCartData = await actions.removeCartItem({ lineItemId: id });
      if (newCartData?.data?.ok && newCartData.data.data) {
        setCartWithIssues(newCartData.data.data);
        toast.success(t("toast.removedFromCart"));
      } else {
        toast.error(t("toast.failedToRemove"));
      }
    },
    [actions, t]
  );

  const updateQuantity = useCallback(
    async (id: string, quantity: number) => {
      const newCartData = await actions.changeCartItemsQuantity({
        lineItemId: id,
        quantity,
      });
      if (newCartData?.data?.ok && newCartData.data.data) {
        setCartWithIssues(newCartData.data.data);
        toast.success(t("toast.updatedQuantity"));
      } else {
        toast.error(t("toast.failedToUpdate"));
      }
    },
    [actions, t]
  );

  const addItem = useCallback(
    async (input: AddToCartInput) => {
      const newCartData = await actions.addToCart(input);
      if (newCartData?.data?.ok && newCartData.data.data) {
        setCartWithIssues(newCartData.data.data);
        setIsOpen(true);
        toast.success(t("toast.addedToCart"));
      } else {
        toast.error(t("toast.failedToAdd"));
      }
    },
    [actions, t]
  );

  const openCart = useCallback(() => {
    setIsOpen(true);
  }, []);

  const closeCart = useCallback(() => {
    setIsOpen(false);
  }, []);

  return (
    <CartContext.Provider
      value={{
        items,
        totalItems,
        totalPrice,
        addItem,
        removeItem,
        updateQuantity,
        isOpen,
        openCart,
        closeCart,
        currencyCode,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error("useCart must be used within a CartProvider");
  }
  return context;
}
