import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer } from "effect";
import { vi } from "vitest";
import { CartId, StoreKey } from "../../domain/cart";
import {
  CheckoutLocale,
  StorefrontAnonymousCheckoutScope,
} from "../../domain/checkout";
import { AddressBook } from "../../services/address-book";
import { CommerceAccounts } from "../../services/commerce-accounts";
import { cartService } from "../cart/cart.service";
import { StoreContexts } from "../store/store-contexts";
import { CheckoutPolicies } from "./checkout-policy";
import { CheckoutSession } from "./checkout-session";
import { layerCommercetoolsCheckoutSession } from "./commercetools";

vi.mock("../cart/cart.service", () => ({
  cartService: {
    getCartById: vi.fn(),
    getActiveCartForAssociateScope: vi.fn(),
    saveCheckoutContact: vi.fn(),
    saveCheckoutDeliveryDetails: vi.fn(),
  },
}));

vi.mock("../client/api-root", () => ({ apiRoot: {} }));
vi.mock("../store/store.service", () => ({ storeService: {} }));

const mockedCartService = vi.mocked(cartService);
const INITIAL_CART_VERSION = 7;
const CURRENT_CART_VERSION = 8;

const scope = new StorefrontAnonymousCheckoutScope({
  channel: "storefrontAnonymous",
  locale: CheckoutLocale.make("en-US"),
  anonymousCartId: CartId.make("cart-1"),
});

const contact = {
  source: "manual",
  buyerContact: {
    email: "ada@example.com",
    firstName: "Ada",
    lastName: "Lovelace",
  },
} as const;

const cart = (version: number, hasOrderCustomType: boolean) => ({
  id: "cart-1",
  version,
  anonymousId: "anonymous-1",
  custom: hasOrderCustomType
    ? {
        type: { key: "orderCustomFields" },
        customFieldsRaw: [],
      }
    : null,
  lineItems: [],
  totalLineItemQuantity: 0,
  totalPrice: {
    currencyCode: "USD" as const,
    centAmount: 0,
  },
  cartState: "Active" as const,
});

const checkoutLayer = layerCommercetoolsCheckoutSession.pipe(
  Layer.provide(
    Layer.mergeAll(
      StoreContexts.layerMemoryFrom({
        locale: CheckoutLocale.make("en-US"),
        storeKey: StoreKey.make("default-store"),
        currency: "USD",
      }),
      CheckoutPolicies.layerEmpty,
      CommerceAccounts.layerMemory,
      AddressBook.layerMemory()
    )
  )
);

describe("layerCommercetoolsCheckoutSession", () => {
  it.effect(
    "reloads the Cart and rebuilds Contact persistence after the custom type is installed concurrently",
    () => {
      const conflict = Object.assign(new Error("Concurrent modification"), {
        statusCode: 409,
        body: {
          errors: [
            {
              code: "ConcurrentModification",
              currentVersion: CURRENT_CART_VERSION,
            },
          ],
        },
      });
      mockedCartService.getCartById
        .mockResolvedValueOnce({
          ok: true,
          data: cart(INITIAL_CART_VERSION, false),
        })
        .mockResolvedValueOnce({
          ok: true,
          data: cart(CURRENT_CART_VERSION, true),
        });
      mockedCartService.saveCheckoutContact
        .mockResolvedValueOnce({
          ok: false,
          error: {
            type: "DomainError",
            code: "CONFLICT",
            message: "Checkout Cart changed before Contact could be saved",
            cause: conflict,
          },
        })
        .mockResolvedValueOnce({ ok: true, data: undefined });

      return Effect.gen(function* () {
        yield* CheckoutSession.saveContact({
          scope,
          cart: {
            id: CartId.make("cart-1"),
            version: INITIAL_CART_VERSION,
          },
          contact,
        });

        expect(mockedCartService.getCartById).toHaveBeenCalledTimes(2);
        expect(mockedCartService.saveCheckoutContact).toHaveBeenCalledTimes(2);
        expect(mockedCartService.saveCheckoutContact).toHaveBeenNthCalledWith(
          1,
          expect.objectContaining({
            cart: cart(INITIAL_CART_VERSION, false),
          })
        );
        expect(mockedCartService.saveCheckoutContact).toHaveBeenNthCalledWith(
          2,
          expect.objectContaining({
            cart: cart(CURRENT_CART_VERSION, true),
          })
        );
      }).pipe(Effect.provide(checkoutLayer));
    }
  );
});
