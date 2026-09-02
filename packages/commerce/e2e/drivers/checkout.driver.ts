import { expect } from "@repo/e2e-testing";
import type { APIRequestContext, Locator, Page } from "@repo/e2e-testing";

import { CartId } from "../../domain/cart";
import { ANONYMOUS_CART_COOKIE_NAME } from "../../lib/cart/utils/anonymous-cart-cookies";
import type { ShippingOptionExpectation } from "../shipping-options-test-control";
import { expectMoney } from "./money.driver";

const droppedPlacementCompletions = new WeakMap<Page, Promise<void>>();

const exactTextIgnoringCase = (value: string): RegExp =>
  new RegExp(`^${value.replaceAll(/[.*+?^${}()|[\]\\]/gu, "\\$&")}$`, "iu");

const assertCheckoutPageName = (pageName: string): void => {
  if (pageName !== "Checkout") {
    throw new Error(`Unsupported Checkout summary: ${pageName}`);
  }
};

const assertDeliveryDetailsStep = (stepName: string): void => {
  if (stepName !== "Delivery Details") {
    throw new Error(`Shipping Addresses cannot be used by ${stepName}`);
  }
};

export class CheckoutDriver {
  readonly #page: Page;

  constructor(page: Page) {
    this.#page = page;
  }

  async expectCartSummary(
    pageName: string,
    quantity: number,
    productName: string
  ): Promise<void> {
    assertCheckoutPageName(pageName);
    const cart = this.#cart();
    await expect(cart.getByRole("heading", { name: "Cart" })).toBeVisible();
    await expect(cart.getByText(productName, { exact: true })).toBeVisible();
    await expect(
      cart.getByText(`Qty ${quantity}`, { exact: true })
    ).toBeVisible();
  }

  async expectCartSubtotal(
    pageName: string,
    amount: string,
    currency: string
  ): Promise<void> {
    assertCheckoutPageName(pageName);
    await expectMoney(
      this.#cart().locator('[data-commerce-money="checkout-subtotal"]'),
      amount,
      currency
    );
  }

  async expectStepStatuses(
    expectedStatuses: ReadonlyMap<string, string>
  ): Promise<void> {
    const checkoutSteps = this.#page.locator("ol");
    const visibleStatuses = new Map([
      ["Active", "Active step"],
      ["Complete", "Complete"],
      ["Incomplete", "Incomplete"],
    ]);

    await Promise.all(
      [...expectedStatuses].map(async ([step, status]) => {
        const visibleStatus = visibleStatuses.get(status);
        if (visibleStatus === undefined) {
          throw new Error(`Unknown Checkout Step status: ${status}`);
        }
        const checkoutStep = checkoutSteps
          .getByRole("listitem")
          .filter({ hasText: step });
        await expect(checkoutStep).toContainText(visibleStatus);
        await expect(checkoutStep).toHaveAttribute(
          "data-state",
          status.toLowerCase()
        );
      })
    );
  }

  async expectStepAction(stepName: string, actionName: string): Promise<void> {
    await expect(
      this.#activeStep(stepName).getByRole("button", { name: actionName })
    ).toBeVisible();
  }

  async useCustomerProfile(stepName: string): Promise<void> {
    if (stepName !== "Contact") {
      throw new Error(`Customer Profile cannot be used for ${stepName}`);
    }

    await this.#activeStep(stepName)
      .getByRole("button", { name: "Use customer profile" })
      .click();
  }

  async expectDefaultShippingAddress(
    stepName: string,
    companyName: string,
    fields: ReadonlyMap<string, string>
  ): Promise<void> {
    assertDeliveryDetailsStep(stepName);
    await this.#expectCompanyContext(companyName);

    const choice = this.#addressChoice(fields);
    await expect(choice).toContainText("Default shipping address");
    await Promise.all(
      [...fields.values()]
        .filter((value) => value.length > 0)
        .map(async (value) => {
          await expect(choice).toContainText(value);
        })
    );
  }

  async selectShippingAddress(
    stepName: string,
    companyName: string,
    fields: ReadonlyMap<string, string>
  ): Promise<void> {
    assertDeliveryDetailsStep(stepName);
    await this.#expectCompanyContext(companyName);

    const choice = this.#addressChoice(fields);
    await choice.getByRole("radio").check();
    await this.#activeStep(stepName)
      .getByRole("button", { name: "Save delivery details" })
      .click();
  }

  async enterContact(fields: ReadonlyMap<string, string>): Promise<void> {
    await this.#fillFields(fields);
    await this.#page.getByRole("button", { name: "Save contact" }).click();
  }

  async enterDeliveryDetails(
    fields: ReadonlyMap<string, string>
  ): Promise<void> {
    await this.#fillFields(fields);
    await this.#page
      .getByRole("button", { name: "Save delivery details" })
      .click();
  }

  async expectDeliveryTargets(
    targets: readonly {
      readonly deliveryGroup: string;
      readonly product: string;
      readonly quantity: number;
    }[]
  ): Promise<void> {
    await Promise.all(
      targets.map(async (target) => {
        const group = this.#deliveryGroup(target.deliveryGroup);
        const visibleTarget = group
          .locator("[data-delivery-target-line-item-id]")
          .filter({ hasText: target.product });
        await expect(visibleTarget).toHaveAttribute(
          "data-delivery-target-quantity",
          String(target.quantity)
        );
      })
    );
  }

  async expectShippingOptions(
    deliveryGroup: string,
    options: readonly ShippingOptionExpectation[]
  ): Promise<void> {
    const group = this.#deliveryGroup(deliveryGroup);
    await Promise.all(
      options.map(async (option) => {
        const choice = this.#shippingOption(group, option.name);
        await expect(choice.getByRole("radio")).toBeVisible();
        await expectMoney(
          choice.locator('[data-commerce-money="shipping-option"]'),
          option.price,
          option.currency
        );
      })
    );
  }

  async selectShippingOption(
    deliveryGroup: string,
    shippingOption: string
  ): Promise<void> {
    await this.#shippingOption(
      this.#deliveryGroup(deliveryGroup),
      shippingOption
    )
      .getByRole("radio")
      .check();
  }

  async saveShippingOptions(): Promise<void> {
    await this.#activeStep("Shipping Options")
      .getByRole("button", { name: "Save shipping options" })
      .click();
  }

  async expectPaymentMethods(
    methods: readonly {
      readonly availability: string;
      readonly name: string;
    }[]
  ): Promise<void> {
    await expect(
      this.#activeStep("Payment Options").locator("[data-payment-method]")
    ).toHaveCount(methods.length);
    await Promise.all(
      methods.map(async ({ availability, name }) => {
        const method = this.#paymentMethod(name);
        await expect(method).toHaveAttribute(
          "data-payment-method-availability",
          availability.toLowerCase()
        );
        await (availability === "Unavailable"
          ? expect(method.getByRole("radio")).toBeDisabled()
          : expect(method.getByRole("radio")).toBeEnabled());
      })
    );
  }

  async currentPaymentOptionsCartId(): Promise<CartId> {
    const cartId = await this.#activeStep("Payment Options")
      .locator("form")
      .filter({ has: this.#page.locator("[data-payment-method]") })
      .locator('input[name="cartId"]')
      .inputValue();
    return CartId.make(cartId);
  }

  async expectNetTermsBalance(amount: string, currency: string): Promise<void> {
    await expectMoney(
      this.#paymentMethod("Net 30").locator(
        '[data-commerce-money="net-terms-available-balance"]'
      ),
      amount,
      currency
    );
  }

  async selectPaymentMethod(name: string): Promise<void> {
    await this.#paymentMethod(name).getByRole("radio").check();
  }

  async savePaymentOptions(): Promise<void> {
    await this.#activeStep("Payment Options")
      .getByRole("button", { name: "Save payment options" })
      .click();
    await expect(
      this.#activeStep("Review Order").getByRole("button", {
        name: "Place order",
      })
    ).toBeVisible();
  }

  async expectPaymentMethodCannotBeSelected(name: string): Promise<void> {
    await expect(this.#paymentMethod(name).getByRole("radio")).toBeDisabled();
  }

  async expectReviewPayment(
    method: string,
    amount: string,
    currency: string
  ): Promise<void> {
    const review = this.#activeStep("Review Order");
    await expect(review.locator("[data-selected-payment-method]")).toHaveText(
      method
    );
    await expectMoney(
      review.locator('[data-commerce-money="prepared-payment"]'),
      amount,
      currency
    );
  }

  async orderPlacementInput(): Promise<{
    readonly cartId: CartId;
  }> {
    const review = this.#activeStep("Review Order");
    const form = review.locator("form").filter({
      has: this.#page.getByRole("button", { name: "Place order" }),
    });
    const cartId = await form.locator('input[name="cartId"]').inputValue();
    return {
      cartId: CartId.make(cartId),
    };
  }

  async placeOrder(): Promise<void> {
    await this.#activeStep("Review Order")
      .getByRole("button", { name: "Place order" })
      .click();
  }

  async clearConsumedCartCookieAndReload(): Promise<void> {
    await this.#page.context().clearCookies({
      name: ANONYMOUS_CART_COOKIE_NAME,
    });
    await this.#page.reload();
  }

  async dropNextPlaceOrderResponse(
    serverRequest: APIRequestContext
  ): Promise<void> {
    const checkoutUrl = new URL(this.#page.url());
    checkoutUrl.search = "";
    let completePlacement: (() => void) | undefined;
    let failPlacement: ((error: Error) => void) | undefined;
    // oxlint-disable-next-line promise/avoid-new, effecttsgo/new-promise -- Playwright's route callback must signal completion to a later browser refresh.
    const completion = new Promise<void>((resolve, reject) => {
      completePlacement = resolve;
      failPlacement = reject;
    });
    void completion.catch(() => undefined);
    droppedPlacementCompletions.set(this.#page, completion);
    await this.#page.route(
      checkoutUrl.href,
      async (route) => {
        if (route.request().method() !== "POST") {
          await route.continue();
          return;
        }
        try {
          const response = await serverRequest.fetch(route.request());
          if (!response.ok()) {
            throw new Error(
              `Detached Place Order request failed with ${response.status()}`
            );
          }
          completePlacement?.();
        } catch (error) {
          failPlacement?.(
            error instanceof Error
              ? error
              : new Error("Detached Place Order request failed", {
                  cause: error,
                })
          );
        } finally {
          await route.abort("failed");
        }
      },
      { times: 1 }
    );
  }

  async refreshCheckout(): Promise<void> {
    const completion = droppedPlacementCompletions.get(this.#page);
    if (completion !== undefined) {
      await completion;
      droppedPlacementCompletions.delete(this.#page);
    }
    await this.#page.reload();
  }

  async expectPaymentOptionsRequiredBeforeOrder(): Promise<void> {
    await expect(
      this.#activeStep("Payment Options").getByRole("button", {
        name: "Save payment options",
      })
    ).toBeVisible({ timeout: 15_000 });
    await expect(
      this.#page.getByRole("button", { name: "Place order" })
    ).toHaveCount(0);
  }

  async expectOrderConfirmation(
    amount: string,
    currency: string
  ): Promise<void> {
    const confirmation = this.#page.locator("[data-order-confirmation]");
    await expect(confirmation).toHaveCount(1, { timeout: 15_000 });
    await expect(
      confirmation.getByRole("heading", { name: "Order confirmed" })
    ).toBeVisible();
    await expectMoney(
      confirmation.locator('[data-commerce-money="order-total"]'),
      amount,
      currency
    );
  }

  async expectPaymentFinalizationPending(): Promise<void> {
    await expect(this.#page.getByRole("status")).toHaveText(
      "Payment finalization is pending."
    );
  }

  async expectOrderRejection(): Promise<void> {
    const review = this.#activeStep("Review Order");
    await expect(review.getByRole("alert")).toBeVisible();
    await expect(
      review.getByRole("button", { name: "Place order" })
    ).toBeVisible();
  }

  async editStep(stepName: string): Promise<void> {
    if (stepName !== "Delivery Details") {
      throw new Error(`Editing ${stepName} is not supported`);
    }
    await this.#page
      .getByText("Edit delivery details", { exact: true })
      .click();
  }

  async expectNoSelectedShippingOption(): Promise<void> {
    await expect(
      this.#cart().locator("[data-selected-shipping-option]")
    ).toHaveCount(0);
    await expect(
      this.#activeStep("Shipping Options").getByRole("radio", {
        checked: true,
      })
    ).toHaveCount(0);
  }

  async expectSelectedShippingOption(
    deliveryGroup: string,
    shippingOption: string,
    price: string,
    currency: string
  ): Promise<void> {
    const selected = this.#selectedDeliveryGroup(deliveryGroup);
    await expect(
      selected.locator("[data-selected-shipping-option]")
    ).toHaveText(shippingOption);
    await expectMoney(
      selected.locator('[data-commerce-money="selected-shipping-option"]'),
      price,
      currency
    );
  }

  #activeStep(stepName: string): Locator {
    return this.#page.locator("section").filter({
      has: this.#page.getByRole("heading", {
        exact: true,
        level: 1,
        name: exactTextIgnoringCase(stepName),
      }),
    });
  }

  #shippingOption(group: Locator, name: string): Locator {
    return group.locator("[data-shipping-option-name]").filter({
      has: this.#page.getByText(exactTextIgnoringCase(name)),
    });
  }

  #paymentMethod(name: string): Locator {
    return this.#activeStep("Payment Options")
      .locator("[data-payment-method]")
      .filter({
        has: this.#page.getByText(exactTextIgnoringCase(name)),
      });
  }

  #addressChoice(address: ReadonlyMap<string, string>): Locator {
    const addressLine1 = address.get("Address line 1");
    if (addressLine1 === undefined || addressLine1.length === 0) {
      throw new Error("The Shipping Address must have Address line 1");
    }

    return this.#activeStep("Delivery Details")
      .locator("label")
      .filter({ hasText: addressLine1 });
  }

  #cart(): Locator {
    return this.#page.locator("aside");
  }

  #deliveryGroup(deliveryGroup: string): Locator {
    return this.#activeStep("Shipping Options")
      .locator("[data-delivery-group]")
      .filter({
        has: this.#page.getByRole("heading", {
          exact: true,
          name: exactTextIgnoringCase(deliveryGroup),
        }),
      });
  }

  #selectedDeliveryGroup(deliveryGroup: string): Locator {
    return this.#cart()
      .locator("[data-selected-delivery-group]")
      .filter({ hasText: deliveryGroup });
  }

  async #expectCompanyContext(companyName: string): Promise<void> {
    await expect(
      this.#page
        .getByRole("group", { name: "Company switcher" })
        .getByText(companyName, { exact: true })
    ).toBeVisible();
  }

  async #fillFields(fields: ReadonlyMap<string, string>): Promise<void> {
    for (const [field, value] of fields) {
      // oxlint-disable-next-line no-await-in-loop -- Browser focus and input events must complete before the next field receives focus.
      await this.#page.getByLabel(field, { exact: true }).fill(value);
    }
  }
}
