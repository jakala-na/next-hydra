import type { CartId } from "../domain/cart";
import {
  ANONYMOUS_CART_COOKIE_NAME,
  decodeAnonymousCartCookie,
} from "../lib/cart/utils/anonymous-cart-cookies";

export interface StoreExpectation {
  readonly currency: string;
  readonly key: string;
  readonly locale: string;
}

export interface ProductExpectation {
  readonly attributes: ReadonlyMap<string, string>;
  readonly currency: string;
  readonly name: string;
  readonly price: string;
}

export interface ShippingAddressExpectation {
  readonly companyName: string;
  readonly fields: ReadonlyMap<string, string>;
}

interface AnonymousCartCookiePage {
  readonly context: () => {
    readonly cookies: () => Promise<
      readonly { readonly name: string; readonly value: string }[]
    >;
  };
}

export interface CheckoutScenarioOptions {
  readonly deleteCart: (cartId: CartId) => Promise<void>;
  readonly page: AnonymousCartCookiePage;
}

export class CheckoutScenario {
  readonly #anonymousCartIds = new Set<CartId>();
  readonly #options: CheckoutScenarioOptions;
  #disposed = false;
  #product?: ProductExpectation;
  #shippingAddress?: ShippingAddressExpectation;
  #store?: StoreExpectation;

  constructor(options: CheckoutScenarioOptions) {
    this.#options = options;
  }

  defineStore(store: StoreExpectation): void {
    this.#store = store;
  }

  requireStore(): StoreExpectation {
    if (this.#store === undefined) {
      throw new Error("The scenario does not define a Store");
    }
    return this.#store;
  }

  defineProduct(product: ProductExpectation): void {
    this.#product = product;
  }

  requireProduct(): ProductExpectation {
    if (this.#product === undefined) {
      throw new Error("The scenario does not define a Product Variant");
    }
    return this.#product;
  }

  defineShippingAddress(address: ShippingAddressExpectation): void {
    this.#shippingAddress = address;
  }

  requireShippingAddress(): ShippingAddressExpectation {
    if (this.#shippingAddress === undefined) {
      throw new Error("The scenario does not define a Shipping Address");
    }
    return this.#shippingAddress;
  }

  async observeAnonymousCart(): Promise<void> {
    const cookies = await this.#options.page.context().cookies();
    for (const { name, value } of cookies) {
      if (name !== ANONYMOUS_CART_COOKIE_NAME) {
        continue;
      }
      const cart = decodeAnonymousCartCookie(value);
      if (cart !== null) {
        this.#anonymousCartIds.add(cart.cartId);
      }
    }
  }

  async dispose(): Promise<void> {
    if (this.#disposed) {
      return;
    }

    await this.observeAnonymousCart();
    const results = await Promise.allSettled(
      [...this.#anonymousCartIds].map(async (cartId) => {
        await this.#options.deleteCart(cartId);
      })
    );
    const failures: unknown[] = [];
    for (const result of results) {
      if (result.status === "rejected") {
        const failure: unknown = result.reason;
        failures.push(failure);
      }
    }
    if (failures.length > 0) {
      throw new AggregateError(
        failures,
        "Failed to clean up Checkout scenario Carts"
      );
    }
    this.#disposed = true;
  }
}

declare module "@repo/e2e-testing" {
  interface E2EFixtures {
    readonly checkoutScenario: CheckoutScenario;
  }
}
