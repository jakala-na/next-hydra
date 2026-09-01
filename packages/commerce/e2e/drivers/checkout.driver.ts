import { expect } from "@repo/e2e-testing";
import type { Locator, Page } from "@repo/e2e-testing";

import type { ShippingOptionExpectation } from "../shipping-options-test-control";
import { expectMoney } from "./money.driver";

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
