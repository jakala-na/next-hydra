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
  readonly ledger?: readonly {
    readonly amount: {
      readonly centAmount: number;
      readonly currencyCode: string;
    };
    readonly direction: string;
    readonly orderReference?: string;
    readonly reference: string;
  }[];
}

export interface CheckoutOrderExpectation {
  readonly id: string;
  readonly number: string;
  readonly totalPrice: {
    readonly centAmount: number;
    readonly currencyCode: string;
  };
}

export interface CheckoutPaymentExpectation {
  readonly method: string;
  readonly provider: string;
  readonly providerReference: string;
  readonly transactions: readonly {
    readonly state: string;
    readonly type: string;
  }[];
}

interface AnonymousCartCookiePage {
  readonly context: () => {
    readonly cookies: () => Promise<
      readonly { readonly name: string; readonly value: string }[]
    >;
  };
}

export interface CheckoutScenarioOptions {
  readonly createCustomerOwnedCart?: (input: {
    readonly currency: string;
    readonly storeKey: string;
  }) => Promise<{ readonly cartId: CartId; readonly customerId: string }>;
  readonly createLegacyCart?: (input: {
    readonly currency: string;
    readonly storeKey: string;
  }) => Promise<CartId>;
  readonly deleteOrder?: (cartId: CartId) => Promise<void>;
  readonly deleteNetTerms?: (businessUnitId: string) => Promise<void>;
  readonly deleteCart: (cartId: CartId) => Promise<void>;
  readonly deleteCustomer?: (customerId: string) => Promise<void>;
  readonly deletePayments?: (cartId: CartId) => Promise<void>;
  readonly expectShippingOptions?: (
    input: ShippingOptionsExpectation
  ) => Promise<void>;
  readonly expectCardNotAuthorized?: (cartId: CartId) => Promise<void>;
  readonly expectCardCaptured?: (
    providerReference: string,
    expectedMinorAmount: number
  ) => Promise<void>;
  readonly getOrder?: (
    cartId: CartId
  ) => Promise<CheckoutOrderExpectation | null>;
  readonly getPayment?: (cartId: CartId) => Promise<CheckoutPaymentExpectation>;
  readonly getNetTerms?: (
    businessUnitId: string
  ) => Promise<NetTermsAccountExpectation>;
  readonly page: AnonymousCartCookiePage;
  readonly prepareCardCaptureFailure?: (cartId: CartId) => Promise<void>;
  readonly prepareOrderRejection?: (cartId: CartId) => Promise<void>;
  readonly setNetTerms?: (input: {
    readonly amount: string;
    readonly businessUnitId: string;
    readonly currency: string;
    readonly termsInDays: number;
  }) => Promise<void>;
}

export class CheckoutScenario {
  readonly #cartIds = new Set<CartId>();
  readonly #customerIdByCartId = new Map<CartId, string>();
  readonly #netTermsBusinessUnitIds = new Set<string>();
  readonly #options: CheckoutScenarioOptions;
  #disposed = false;
  #currentCartId?: CartId;
  #cardCaptureFailureRequested = false;
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
    const actualSeed = {
      availableCredit: actual.availableCredit,
      termsInDays: actual.termsInDays,
    };
    if (JSON.stringify(actualSeed) !== JSON.stringify(expected)) {
      throw new Error(
        `Net Terms did not match the scenario input: expected ${JSON.stringify(expected)}, received ${JSON.stringify(actualSeed)}`
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

  requireCurrentCartId(): CartId {
    if (this.#currentCartId === undefined) {
      throw new Error("The scenario has no current Cart");
    }
    return this.#currentCartId;
  }

  async createLegacyCart(): Promise<CartId> {
    if (this.#options.createLegacyCart === undefined) {
      throw new Error("The scenario cannot create a live Legacy Cart");
    }
    const store = this.requireStore();
    const cartId = await this.#options.createLegacyCart({
      currency: store.currency,
      storeKey: store.key,
    });
    this.rememberCart(cartId);
    return cartId;
  }

  async createCustomerOwnedCart(): Promise<CartId> {
    if (
      this.#options.createCustomerOwnedCart === undefined ||
      this.#options.deleteCustomer === undefined
    ) {
      throw new Error("The scenario cannot create a customer-owned Cart");
    }
    const store = this.requireStore();
    const fixture = await this.#options.createCustomerOwnedCart({
      currency: store.currency,
      storeKey: store.key,
    });
    this.rememberCart(fixture.cartId);
    this.#customerIdByCartId.set(fixture.cartId, fixture.customerId);
    return fixture.cartId;
  }

  requestCardCaptureFailure(): void {
    this.#cardCaptureFailureRequested = true;
  }

  async afterPaymentOptionsSaved(): Promise<void> {
    if (!this.#cardCaptureFailureRequested) {
      return;
    }
    if (this.#options.prepareCardCaptureFailure === undefined) {
      throw new Error("The scenario cannot configure Card capture failure");
    }
    await this.#options.prepareCardCaptureFailure(this.requireCurrentCartId());
    this.#cardCaptureFailureRequested = false;
  }

  async prepareOrderRejection(): Promise<void> {
    if (this.#options.prepareOrderRejection === undefined) {
      throw new Error("The scenario cannot configure Order rejection");
    }
    await this.#options.prepareOrderRejection(this.requireCurrentCartId());
  }

  async expectOrder(amount: string, currency: string): Promise<void> {
    if (this.#options.getOrder === undefined) {
      throw new Error("The scenario cannot inspect Orders");
    }
    const order = await this.#options.getOrder(this.requireCurrentCartId());
    if (order === null) {
      throw new Error("The Checkout Order does not exist");
    }
    const expected = {
      centAmount: Number(minorAmountFromDecimal(amount)),
      currencyCode: currency,
    };
    if (
      order.totalPrice.centAmount !== expected.centAmount ||
      order.totalPrice.currencyCode !== expected.currencyCode
    ) {
      throw new Error(
        `Order total did not match: expected ${JSON.stringify(expected)}, received ${JSON.stringify(order.totalPrice)}`
      );
    }
  }

  async expectNoOrder(): Promise<void> {
    if (this.#options.getOrder === undefined) {
      throw new Error("The scenario cannot inspect Orders");
    }
    const order = await this.#options.getOrder(this.requireCurrentCartId());
    if (order !== null) {
      throw new Error(`Unexpected Checkout Order ${order.id}`);
    }
  }

  async expectPaymentTransactions(
    method: string,
    expected: readonly { readonly state: string; readonly type: string }[]
  ): Promise<void> {
    if (this.#options.getPayment === undefined) {
      throw new Error("The scenario cannot inspect Payments");
    }
    const payment = await this.#options.getPayment(this.requireCurrentCartId());
    if (payment.method !== method) {
      throw new Error(
        `Expected Payment Method ${method}, received ${payment.method}`
      );
    }
    if (JSON.stringify(payment.transactions) !== JSON.stringify(expected)) {
      throw new Error(
        `Payment transactions did not match: expected ${JSON.stringify(expected)}, received ${JSON.stringify(payment.transactions)}`
      );
    }
  }

  async expectCardCaptured(amount: string): Promise<void> {
    if (
      this.#options.getPayment === undefined ||
      this.#options.expectCardCaptured === undefined
    ) {
      throw new Error("The scenario cannot inspect captured Card Payments");
    }
    const payment = await this.#options.getPayment(this.requireCurrentCartId());
    await this.#options.expectCardCaptured(
      payment.providerReference,
      Number(minorAmountFromDecimal(amount))
    );
  }

  async expectCardCapturedForOrder(): Promise<void> {
    if (
      this.#options.getOrder === undefined ||
      this.#options.getPayment === undefined ||
      this.#options.expectCardCaptured === undefined
    ) {
      throw new Error("The scenario cannot inspect captured Card Payments");
    }
    const cartId = this.requireCurrentCartId();
    const [order, payment] = await Promise.all([
      this.#options.getOrder(cartId),
      this.#options.getPayment(cartId),
    ]);
    if (order === null) {
      throw new Error("The Checkout Order does not exist");
    }
    await this.#options.expectCardCaptured(
      payment.providerReference,
      order.totalPrice.centAmount
    );
  }

  async expectNoPaymentTransaction(type: string): Promise<void> {
    if (this.#options.getPayment === undefined) {
      throw new Error("The scenario cannot inspect Payments");
    }
    const payment = await this.#options.getPayment(this.requireCurrentCartId());
    if (payment.transactions.some((transaction) => transaction.type === type)) {
      throw new Error(`Payment unexpectedly contains a ${type} transaction`);
    }
  }

  async expectNetTermsLedgerDebit(input: {
    readonly amount: string;
    readonly businessUnitId: string;
    readonly currency: string;
  }): Promise<void> {
    if (this.#options.getNetTerms === undefined) {
      throw new Error("The scenario cannot inspect Net Terms");
    }
    const profile = await this.#options.getNetTerms(input.businessUnitId);
    const expectedAmount = {
      centAmount: Number(minorAmountFromDecimal(input.amount)),
      currencyCode: input.currency,
    };
    const debit = profile.ledger?.find(
      (entry) =>
        entry.direction === "debit" &&
        JSON.stringify(entry.amount) === JSON.stringify(expectedAmount)
    );
    if (debit === undefined) {
      throw new Error(
        `Net Terms ledger has no debit for ${JSON.stringify(expectedAmount)}`
      );
    }
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
          await this.#options.deleteOrder?.(cartId);
        } catch (error) {
          cartFailures.push(error);
        }
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
        const customerId = this.#customerIdByCartId.get(cartId);
        if (customerId !== undefined) {
          try {
            await this.#options.deleteCustomer?.(customerId);
          } catch (error) {
            cartFailures.push(error);
          }
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
