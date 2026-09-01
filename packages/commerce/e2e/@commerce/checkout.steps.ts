import type { AuthContext } from "@repo/auth-contract/e2e/auth-context";
import { Given, Then, When } from "@repo/e2e-testing";
import type { DataTable } from "@repo/e2e-testing";

import { CartDriver } from "../drivers/cart.driver";
import { CatalogDriver } from "../drivers/catalog.driver";
import { CheckoutDriver } from "../drivers/checkout.driver";
import type { ShippingOptionExpectation } from "../shipping-options-test-control";

const keyValueTable = (
  dataTable: DataTable,
  expectedHeaders: readonly [string, string]
): ReadonlyMap<string, string> => {
  const [headers, ...rows] = dataTable.raw();
  if (
    headers?.length !== 2 ||
    headers[0] !== expectedHeaders[0] ||
    headers[1] !== expectedHeaders[1]
  ) {
    throw new Error(
      `Expected table headers "${expectedHeaders[0]}" and "${expectedHeaders[1]}"`
    );
  }

  const entries = rows.map((row) => {
    const [key, value, ...unexpectedValues] = row;
    if (
      key === undefined ||
      value === undefined ||
      unexpectedValues.length > 0
    ) {
      throw new Error("Each table row must contain exactly two values");
    }
    return [key, value] as const;
  });
  const values = new Map(entries);

  if (values.size !== entries.length) {
    throw new Error(`Table values for ${expectedHeaders[0]} must be unique`);
  }
  return values;
};

const expectKeys = (
  values: ReadonlyMap<string, string>,
  expectedKeys: readonly string[]
) => {
  const actualKeys = [...values.keys()];
  const unexpected = actualKeys.filter((key) => !expectedKeys.includes(key));
  const missing = expectedKeys.filter((key) => !values.has(key));

  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `Expected fields ${expectedKeys.join(", ")}; missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}`
    );
  }
};

const expectSameValues = (
  actual: ReadonlyMap<string, string>,
  expected: ReadonlyMap<string, string>,
  label: string
) => {
  if (
    actual.size !== expected.size ||
    [...expected].some(([key, value]) => actual.get(key) !== value)
  ) {
    throw new Error(
      `${label} did not match the Product Variant defined by the scenario`
    );
  }
};

const rowsWithHeaders = (
  dataTable: DataTable,
  expectedHeaders: readonly string[]
): readonly ReadonlyMap<string, string>[] => {
  const [headers, ...rows] = dataTable.raw();
  if (
    headers?.length !== expectedHeaders.length ||
    expectedHeaders.some((header, index) => headers[index] !== header)
  ) {
    throw new Error(`Expected table headers ${expectedHeaders.join(", ")}`);
  }

  return rows.map((row) => {
    if (row.length !== expectedHeaders.length) {
      throw new Error(
        `Each table row must contain ${expectedHeaders.length} values`
      );
    }
    return new Map(
      expectedHeaders.map((header, index) => [header, row[index] ?? ""])
    );
  });
};

const shippingOptionsFrom = (
  dataTable: DataTable
): readonly ShippingOptionExpectation[] =>
  rowsWithHeaders(dataTable, ["Shipping Option", "Price", "Currency"]).map(
    (row) => ({
      currency: row.get("Currency") ?? "",
      name: row.get("Shipping Option") ?? "",
      price: row.get("Price") ?? "",
    })
  );

const expectCustomer = (auth: AuthContext, customerName: string): void => {
  if (auth.identityFor(customerName) === undefined) {
    throw new Error(
      `The scenario does not have a Customer named ${customerName}`
    );
  }
};

const SHIPPING_ADDRESS_FIELDS = [
  "Address line 1",
  "Address line 2",
  "City",
  "Postal code",
  "Region",
  "Country",
] as const;

Given(
  "Store {string} serves locale {string} in currency {string}",
  async (
    { checkoutScenario, page },
    storeKey: string,
    locale: string,
    currency: string
  ) => {
    const store = { currency, key: storeKey, locale };
    checkoutScenario.defineStore(store);
    await new CatalogDriver(page).switchStore(store);
  }
);

Given(
  "deliveries to {string} have Shipping Options:",
  async ({ checkoutScenario }, country: string, dataTable: DataTable) => {
    await checkoutScenario.expectShippingOptions(
      country,
      shippingOptionsFrom(dataTable)
    );
  }
);

Given(
  "Product {string} has an available Product Variant in Store {string} priced at {string} in currency {string} with attributes:",
  async (
    { checkoutScenario, page },
    productName: string,
    storeKey: string,
    price: string,
    currency: string,
    dataTable: DataTable
  ) => {
    const store = checkoutScenario.requireStore();
    if (store.key !== storeKey || store.currency !== currency) {
      throw new Error(
        `Product Variant Store ${storeKey}/${currency} does not match configured Store ${store.key}/${store.currency}`
      );
    }

    const product = {
      attributes: keyValueTable(dataTable, ["Attribute", "Value"]),
      currency,
      name: productName,
      price,
    };
    await new CatalogDriver(page).expectLiveProduct(product, store);
    checkoutScenario.defineProduct(product);
  }
);

When(
  "an anonymous buyer visits the PDP for Product {string}",
  async ({ checkoutScenario, page }, productName: string) => {
    const product = checkoutScenario.requireProduct();
    if (product.name !== productName) {
      throw new Error(
        `Expected the buyer to visit ${product.name}, received ${productName}`
      );
    }
    await new CatalogDriver(page).openProduct(productName);
  }
);

When(
  "Customer {string} visits the PDP for Product {string}",
  async (
    { auth, checkoutScenario, page },
    customerName: string,
    productName: string
  ) => {
    expectCustomer(auth, customerName);
    const product = checkoutScenario.requireProduct();
    if (product.name !== productName) {
      throw new Error(
        `Expected the buyer to visit ${product.name}, received ${productName}`
      );
    }
    await new CatalogDriver(page).openProduct(productName);
  }
);

When(
  "the buyer selects the Product Variant with attributes:",
  async ({ checkoutScenario, page }, dataTable: DataTable) => {
    const product = checkoutScenario.requireProduct();
    const attributes = keyValueTable(dataTable, ["Attribute", "Value"]);
    expectSameValues(attributes, product.attributes, "Selected attributes");
    await new CatalogDriver(page).selectVariant(attributes);
  }
);

When(
  "the buyer adds {int} unit of the selected Product Variant to their Cart",
  async ({ checkoutScenario, page }, quantity: number) => {
    try {
      await new CatalogDriver(page).addSelectedVariantToCart(quantity);
    } finally {
      await checkoutScenario.observeAnonymousCart();
    }
  }
);

Then(
  "the Cart is open with {int} unit of Product {string}",
  async ({ page }, quantity: number, productName: string) => {
    await new CartDriver(page).expectOpenWithProduct(quantity, productName);
  }
);

Then(
  "the Cart subtotal is {string} in currency {string}",
  async ({ page }, amount: string, currency: string) => {
    await new CartDriver(page).expectSubtotal(amount, currency);
  }
);

When(
  "the buyer proceeds from the Cart to {string}",
  async ({ page }, destination: string) => {
    await new CartDriver(page).proceedTo(destination);
  }
);

Then(
  "the {string} Cart summary contains {int} unit of Product {string}",
  async ({ page }, pageName: string, quantity: number, productName: string) => {
    await new CheckoutDriver(page).expectCartSummary(
      pageName,
      quantity,
      productName
    );
  }
);

Then(
  "the {string} Cart subtotal is {string} in currency {string}",
  async ({ page }, pageName: string, amount: string, currency: string) => {
    await new CheckoutDriver(page).expectCartSubtotal(
      pageName,
      amount,
      currency
    );
  }
);

Then(
  "the Checkout Steps have statuses:",
  async ({ page }, dataTable: DataTable) => {
    await new CheckoutDriver(page).expectStepStatuses(
      keyValueTable(dataTable, ["Step", "Status"])
    );
  }
);

Then(
  "the {string} Step offers {string}",
  async ({ page }, stepName: string, actionName: string) => {
    await new CheckoutDriver(page).expectStepAction(stepName, actionName);
  }
);

When(
  "Customer {string} uses their Profile for {string}",
  async ({ auth, page }, customerName: string, stepName: string) => {
    expectCustomer(auth, customerName);
    await new CheckoutDriver(page).useCustomerProfile(stepName);
  }
);

Then(
  "{string} offers the default Shipping Address for Company {string}:",
  async (
    { checkoutScenario, page },
    stepName: string,
    companyName: string,
    dataTable: DataTable
  ) => {
    const fields = keyValueTable(dataTable, ["Field", "Value"]);
    expectKeys(fields, SHIPPING_ADDRESS_FIELDS);
    const shippingAddress = { companyName, fields };
    checkoutScenario.defineShippingAddress(shippingAddress);
    await new CheckoutDriver(page).expectDefaultShippingAddress(
      stepName,
      companyName,
      fields
    );
  }
);

When(
  "Customer {string} selects that Shipping Address and saves {string}",
  async (
    { auth, checkoutScenario, page },
    customerName: string,
    stepName: string
  ) => {
    expectCustomer(auth, customerName);
    const shippingAddress = checkoutScenario.requireShippingAddress();
    await new CheckoutDriver(page).selectShippingAddress(
      stepName,
      shippingAddress.companyName,
      shippingAddress.fields
    );
  }
);

When(
  "the buyer enters and saves Contact details:",
  async ({ page }, dataTable: DataTable) => {
    const contact = keyValueTable(dataTable, ["Field", "Value"]);
    expectKeys(contact, ["Email", "First name", "Last name", "Phone"]);
    await new CheckoutDriver(page).enterContact(contact);
  }
);

When(
  "the buyer enters and saves Delivery Details:",
  async ({ page }, dataTable: DataTable) => {
    const address = keyValueTable(dataTable, ["Field", "Value"]);
    expectKeys(address, SHIPPING_ADDRESS_FIELDS);
    await new CheckoutDriver(page).enterDeliveryDetails(address);
  }
);

Then(
  "Shipping Options presents a Delivery Plan with targets:",
  async ({ page }, dataTable: DataTable) => {
    const targets = rowsWithHeaders(dataTable, [
      "Delivery Group",
      "Product",
      "Quantity",
    ]).map((row) => {
      const quantity = Number(row.get("Quantity"));
      if (!Number.isSafeInteger(quantity) || quantity <= 0) {
        throw new Error(
          `Invalid Delivery Target quantity: ${String(quantity)}`
        );
      }
      return {
        deliveryGroup: row.get("Delivery Group") ?? "",
        product: row.get("Product") ?? "",
        quantity,
      };
    });
    await new CheckoutDriver(page).expectDeliveryTargets(targets);
  }
);

Then(
  "Delivery Group {string} offers Shipping Options:",
  async ({ page }, deliveryGroup: string, dataTable: DataTable) => {
    await new CheckoutDriver(page).expectShippingOptions(
      deliveryGroup,
      shippingOptionsFrom(dataTable)
    );
  }
);

When(
  "the buyer selects Shipping Option {string} for Delivery Group {string}",
  async ({ page }, shippingOption: string, deliveryGroup: string) => {
    await new CheckoutDriver(page).selectShippingOption(
      deliveryGroup,
      shippingOption
    );
  }
);

When("the buyer saves Shipping Options", async ({ page }) => {
  await new CheckoutDriver(page).saveShippingOptions();
});

Then(
  "Payment Options offers Payment Methods:",
  async ({ checkoutScenario, page }, dataTable: DataTable) => {
    const methods = rowsWithHeaders(dataTable, [
      "Payment Method",
      "Availability",
    ]).map((row) => ({
      availability: row.get("Availability") ?? "",
      name: row.get("Payment Method") ?? "",
    }));
    const checkout = new CheckoutDriver(page);
    checkoutScenario.rememberCart(await checkout.currentPaymentOptionsCartId());
    await checkout.expectPaymentMethods(methods);
  }
);

Then(
  "Net 30 shows {string} available to spend in currency {string}",
  async ({ page }, amount: string, currency: string) => {
    await new CheckoutDriver(page).expectNetTermsBalance(amount, currency);
  }
);

When(
  "the buyer enters valid Card details and uses the Shipping Address for Billing",
  async ({ cardPaymentEntry }) => {
    await cardPaymentEntry.enterValidDetails();
  }
);

When(
  "the buyer selects Payment Method {string} and uses the Shipping Address for Billing",
  async ({ page }, method: string) => {
    await new CheckoutDriver(page).selectPaymentMethod(method);
  }
);

When("the buyer saves Payment Options", async ({ checkoutScenario, page }) => {
  const checkout = new CheckoutDriver(page);
  checkoutScenario.rememberCart(await checkout.currentPaymentOptionsCartId());
  await checkout.savePaymentOptions();
});

Then(
  "Review Order shows Payment Method {string} with planned amount {string} in currency {string}",
  async ({ page }, method: string, amount: string, currency: string) => {
    await new CheckoutDriver(page).expectReviewPayment(
      method,
      amount,
      currency
    );
  }
);

Then(
  "the Card Payment has not been authorized",
  async ({ checkoutScenario }) => {
    await checkoutScenario.expectCardNotAuthorized();
  }
);

Then(
  "the buyer cannot select Payment Method {string}",
  async ({ page }, method: string) => {
    await new CheckoutDriver(page).expectPaymentMethodCannotBeSelected(method);
  }
);

When("the buyer chooses to edit {string}", async ({ page }, step: string) => {
  await new CheckoutDriver(page).editStep(step);
});

Then("no selected Shipping Option is shown", async ({ page }) => {
  await new CheckoutDriver(page).expectNoSelectedShippingOption();
});

Then(
  "Delivery Group {string} has selected Shipping Option {string} priced at {string} in currency {string}",
  async (
    { page },
    deliveryGroup: string,
    shippingOption: string,
    price: string,
    currency: string
  ) => {
    await new CheckoutDriver(page).expectSelectedShippingOption(
      deliveryGroup,
      shippingOption,
      price,
      currency
    );
  }
);
