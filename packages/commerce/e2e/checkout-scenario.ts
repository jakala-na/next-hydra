import type { CartId } from "../domain/cart";
import {
  ANONYMOUS_CART_COOKIE_NAME,
  decodeAnonymousCartCookie,
} from "../lib/cart/utils/anonymous-cart-cookies";
import { minorAmountFromDecimal } from "./checkout-expectations";
import type {
  ShippingOptionExpectation,
  ShippingOptionsExpectation,
} from "./shipping-options-test-control";

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

export interface NetTermsAccountExpectation {
  readonly availableCredit: {
    readonly centAmount: number;
    readonly currencyCode: string;
  };
  readonly termsInDays: number;
}

interface AnonymousCartCookiePage {
  readonly context: () => {
    readonly cookies: () => Promise<
      readonly { readonly name: string; readonly value: string }[]
    >;
  };
}

export interface CheckoutScenarioOptions {
  readonly deleteNetTerms?: (businessUnitId: string) => Promise<void>;
  readonly deleteCart: (cartId: CartId) => Promise<void>;
  readonly deletePayments?: (cartId: CartId) => Promise<void>;
  readonly expectShippingOptions?: (
    input: ShippingOptionsExpectation
  ) => Promise<void>;
  readonly expectCardNotAuthorized?: (cartId: CartId) => Promise<void>;
  readonly getNetTerms?: (
    businessUnitId: string
  ) => Promise<NetTermsAccountExpectation>;
  readonly page: AnonymousCartCookiePage;
  readonly setNetTerms?: (input: {
    readonly amount: string;
    readonly businessUnitId: string;
    readonly currency: string;
    readonly termsInDays: number;
  }) => Promise<void>;
}

export class CheckoutScenario {
  readonly #cartIds = new Set<CartId>();
  readonly #netTermsBusinessUnitIds = new Set<string>();
  readonly #options: CheckoutScenarioOptions;
  #disposed = false;
  #currentCartId?: CartId;
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

  async expectShippingOptions(
    country: string,
    options: readonly ShippingOptionExpectation[]
  ): Promise<void> {
    if (this.#options.expectShippingOptions === undefined) {
      throw new Error("The scenario cannot inspect live Shipping Options");
    }
    await this.#options.expectShippingOptions({ country, options });
  }

  async setNetTerms(input: {
    readonly amount: string;
    readonly businessUnitId: string;
    readonly currency: string;
    readonly termsInDays: number;
  }): Promise<void> {
    if (this.#options.setNetTerms === undefined) {
      throw new Error("The scenario cannot configure Net Terms");
    }
    await this.#options.setNetTerms(input);
    this.#netTermsBusinessUnitIds.add(input.businessUnitId);
  }

  async expectNetTerms(input: {
    readonly amount: string;
    readonly businessUnitId: string;
    readonly currency: string;
    readonly termsInDays: number;
  }): Promise<void> {
    if (this.#options.getNetTerms === undefined) {
      throw new Error("The scenario cannot inspect Net Terms");
    }
    const actual = await this.#options.getNetTerms(input.businessUnitId);
    const expected = {
      availableCredit: {
        centAmount: Number(minorAmountFromDecimal(input.amount)),
        currencyCode: input.currency,
      },
      termsInDays: input.termsInDays,
    };
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(
        `Net Terms did not match the scenario input: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actual)}`
      );
    }
  }

  async expectCardNotAuthorized(): Promise<void> {
    if (this.#options.expectCardNotAuthorized === undefined) {
      throw new Error("The scenario cannot inspect live Card Payments");
    }
    const cookies = await this.#options.page.context().cookies();
    const anonymousCart = cookies
      .filter(({ name }) => name === ANONYMOUS_CART_COOKIE_NAME)
      .map(({ value }) => decodeAnonymousCartCookie(value))
      .find((cart) => cart !== null);
    const cartId = anonymousCart?.cartId ?? this.#currentCartId;
    if (cartId === undefined) {
      throw new Error("The scenario has no current Cart");
    }
    await this.#options.expectCardNotAuthorized(cartId);
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
        this.rememberCart(cart.cartId);
      }
    }
  }

  rememberCart(cartId: CartId): void {
    this.#cartIds.add(cartId);
    this.#currentCartId = cartId;
  }

  async dispose(): Promise<void> {
    if (this.#disposed) {
      return;
    }

    await this.observeAnonymousCart();
    const results = await Promise.allSettled([
      ...[...this.#cartIds].map(async (cartId) => {
        const cartFailures: unknown[] = [];
        try {
          await this.#options.deleteCart(cartId);
        } catch (error) {
          cartFailures.push(error);
        }
        try {
          await this.#options.deletePayments?.(cartId);
        } catch (error) {
          cartFailures.push(error);
        }
        if (cartFailures.length === 1) {
          throw cartFailures[0];
        }
        if (cartFailures.length > 1) {
          throw new AggregateError(
            cartFailures,
            `Failed to clean up Checkout Cart ${cartId}`
          );
        }
      }),
      ...[...this.#netTermsBusinessUnitIds].map(async (businessUnitId) => {
        await this.#options.deleteNetTerms?.(businessUnitId);
      }),
    ]);
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
        "Failed to clean up Checkout scenario resources"
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
