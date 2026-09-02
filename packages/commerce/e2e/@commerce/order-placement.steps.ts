import { expect, Then, When, test } from "@repo/e2e-testing";
import type { DataTable } from "@repo/e2e-testing";

import { CheckoutDriver } from "../drivers/checkout.driver";

const transactionsFrom = (dataTable: DataTable) => {
  const [headers, ...rows] = dataTable.raw();
  if (
    headers?.length !== 2 ||
    headers[0] !== "Transaction" ||
    headers[1] !== "State"
  ) {
    throw new Error('Expected table headers "Transaction" and "State"');
  }
  return rows.map((row) => {
    const [type, state, ...unexpected] = row;
    if (type === undefined || state === undefined || unexpected.length > 0) {
      throw new Error("Each Payment transaction row must have two values");
    }
    return { state, type };
  });
};

When(
  "the buyer submits Place Order twice for the same Checkout",
  async ({ apiRequest, page }) => {
    const checkout = new CheckoutDriver(page);
    const input = await checkout.orderPlacementInput();
    const cookies = await page.context().cookies();
    const cartCookie = cookies.find((cookie) => cookie.name === "cart");
    if (cartCookie === undefined) {
      throw new Error("Expected the anonymous Checkout Cart cookie");
    }

    await checkout.placeOrder();
    await expect(page.locator("[data-order-confirmation]")).toHaveCount(1, {
      timeout: 15_000,
    });

    const replay = await apiRequest.post("/checkout/orders", {
      data: {
        cart: { id: input.cartId },
      },
      headers: {
        cookie: `${cartCookie.name}=${cartCookie.value}`,
        "x-context-locale": "en-US",
      },
    });
    expect(replay.ok()).toBeTruthy();
    expect(await replay.json()).toMatchObject({
      _tag: "Placed",
      order: { cartId: input.cartId },
    });
  }
);

When("the buyer places the Order", async ({ page }) => {
  test.setTimeout(60_000);
  await new CheckoutDriver(page).placeOrder();
});

When("the buyer retries Place Order", async ({ page }) => {
  await new CheckoutDriver(page).placeOrder();
});

When(
  "the buyer enters Card details that require additional authentication and uses the Shipping Address for Billing",
  async ({ cardPaymentEntry }) => {
    await cardPaymentEntry.enterAuthenticationRequiredDetails();
  }
);

Then(
  "Card authentication is required before the Order is created",
  async ({ cardPaymentEntry, checkoutScenario }) => {
    await cardPaymentEntry.expectAuthenticationRequired();
    await checkoutScenario.expectNoOrder();
  }
);

When("the buyer cancels Card authentication", async ({ cardPaymentEntry }) => {
  await cardPaymentEntry.cancelAuthentication();
});

When(
  "the buyer enters Card details that fail during capture and uses the Shipping Address for Billing",
  async ({ cardPaymentEntry, checkoutScenario }) => {
    checkoutScenario.requestCardCaptureFailure();
    await cardPaymentEntry.enterValidDetails();
  }
);

When(
  "Order placement will be rejected after Payment Authorization",
  async ({ checkoutScenario }) => {
    await checkoutScenario.prepareOrderRejection();
  }
);

When(
  "Order creation will succeed without returning its response",
  async ({ apiRequest, page }) => {
    await new CheckoutDriver(page).dropNextPlaceOrderResponse(apiRequest);
  }
);

When("the consumed Checkout Cart cookie is cleared", async ({ page }) => {
  await new CheckoutDriver(page).clearConsumedCartCookieAndReload();
});

When("the buyer refreshes Checkout", async ({ page }) => {
  await new CheckoutDriver(page).refreshCheckout();
});

Then(
  "Order Confirmation shows one Order for {string} in currency {string}",
  async ({ checkoutScenario, page }, amount: string, currency: string) => {
    await new CheckoutDriver(page).expectOrderConfirmation(amount, currency);
    await checkoutScenario.expectOrder(amount, currency);
  }
);

Then(
  "Order Confirmation shows Payment Method {string}",
  async ({ page }, paymentMethod: string) => {
    await expect(page.locator("[data-order-payment-method]")).toHaveText(
      paymentMethod
    );
  }
);

Then(
  "the {word} Payment records transactions:",
  async ({ checkoutScenario }, paymentMethod: string, dataTable: DataTable) => {
    const method = paymentMethod === "Card" ? "card" : paymentMethod;
    await checkoutScenario.expectPaymentTransactions(
      method,
      transactionsFrom(dataTable)
    );
  }
);

Then(
  "the Net 30 Payment records transactions:",
  async ({ checkoutScenario }, dataTable: DataTable) => {
    await checkoutScenario.expectPaymentTransactions(
      "netTerms",
      transactionsFrom(dataTable)
    );
  }
);

Then(
  "Stripe has one authorization and one capture for the Order",
  async ({ checkoutScenario }) => {
    await checkoutScenario.expectCardCapturedForOrder();
  }
);

Then(
  "the buyer remains on Review Order with the Order rejection",
  async ({ page }) => {
    await new CheckoutDriver(page).expectOrderRejection();
  }
);

Then("no Order exists for the Checkout", async ({ checkoutScenario }) => {
  await checkoutScenario.expectNoOrder();
});

Then(
  "the buyer cannot place an Order until Card Payment Options are saved again",
  async ({ page }) => {
    await new CheckoutDriver(page).expectPaymentOptionsRequiredBeforeOrder();
  }
);

Then(
  "the Card Payment has no Charge transaction",
  async ({ checkoutScenario }) => {
    await checkoutScenario.expectNoPaymentTransaction("Charge");
  }
);

Then(
  "Order Confirmation shows that Payment finalization is pending",
  async ({ page }) => {
    await new CheckoutDriver(page).expectPaymentFinalizationPending();
  }
);

Then(
  "Company {string} has a {string} ledger debit in currency {string} for the Order",
  async (
    { businessUnits, checkoutScenario },
    companyName: string,
    amount: string,
    currency: string
  ) => {
    await checkoutScenario.expectNetTermsLedgerDebit({
      amount,
      businessUnitId: businessUnits.idForCompany(companyName),
      currency,
    });
  }
);

Then(
  "Company {string} has {string} available to spend in currency {string}",
  async (
    { businessUnits, checkoutScenario },
    companyName: string,
    amount: string,
    currency: string
  ) => {
    await checkoutScenario.expectNetTerms({
      amount,
      businessUnitId: businessUnits.idForCompany(companyName),
      currency,
      termsInDays: 30,
    });
  }
);
