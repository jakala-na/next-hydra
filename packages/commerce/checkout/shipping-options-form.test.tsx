/* oxlint-disable typescript/promise-function-async -- The uncalled Server Action double returns an already-rejected Promise to satisfy the action contract. */
import { NextIntlClientProvider } from "@repo/i18n";
import messages from "@repo/i18n/messages/en-US.json";
import { act } from "react";
import { createRoot } from "react-dom/client";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";

import { CountryCode } from "../domain/address";
import { CartId, LineItemId, ProductId, VariantId } from "../domain/cart";
import type { CartSnapshot } from "../domain/cart-snapshot";
import {
  DeliveryGroupReference,
  DeliveryPlanQuoteReference,
  DeliveryPlanReference,
  ShippingOptionReference,
} from "../domain/delivery-plan";
import type {
  DeliveryPlanQuote,
  SelectedDeliveryPlan,
} from "../domain/delivery-plan";
import { CurrencyCode } from "../domain/money";
import { StoreKey } from "../store";
import type { SaveCheckoutShippingOptionsAction } from "./action-contract";
import { CheckoutShippingOptionsForm } from "./shipping-options-form";

const roots: ReturnType<typeof createRoot>[] = [];

const cart: CartSnapshot = {
  checkoutDetails: {},
  id: CartId.make("cart-1"),
  lineItems: [
    {
      id: LineItemId.make("line-item-1"),
      quantity: 1,
      totalPrice: { centAmount: 2500, currencyCode: CurrencyCode.make("USD") },
      unitPrice: { centAmount: 2500, currencyCode: CurrencyCode.make("USD") },
      variant: {
        id: VariantId.make("variant-1"),
        images: [],
        name: "Hydra Wrench",
        productId: ProductId.make("product-1"),
      },
    },
  ],
  status: "active",
  storeKey: StoreKey.make("default-store"),
  totalLineItemQuantity: 1,
  totalPrice: { centAmount: 2500, currencyCode: CurrencyCode.make("USD") },
};

const groupReference = DeliveryGroupReference.make("delivery-1");
const planReference = DeliveryPlanReference.make("plan-1");
const shippingOption = {
  name: "Standard",
  price: { centAmount: 500, currencyCode: CurrencyCode.make("USD") },
  reference: ShippingOptionReference.make("standard"),
};
const shippingAddress = {
  addressLine1: "1 Hydra Way",
  city: "New York",
  country: CountryCode.make("US"),
  postalCode: "10001",
};
const deliveryGroup = {
  reference: groupReference,
  shippingAddress,
  shippingOptions: [shippingOption],
  targets: [{ lineItemId: LineItemId.make("line-item-1"), quantity: 1 }],
} as const;

const quote = (reference: string): DeliveryPlanQuote => ({
  plans: [{ groups: [deliveryGroup], reference: planReference }],
  reference: DeliveryPlanQuoteReference.make(reference),
});

const selectedPlan: SelectedDeliveryPlan = {
  groups: [
    {
      reference: groupReference,
      selectedShippingOption: shippingOption,
      shippingAddress,
      targets: [{ lineItemId: LineItemId.make("line-item-1"), quantity: 1 }],
    },
  ],
  quoteReference: DeliveryPlanQuoteReference.make("quote-1"),
  reference: planReference,
};

const saveAction: SaveCheckoutShippingOptionsAction = () =>
  Promise.reject(
    new Error("The Shipping Options form should not submit in this test")
  );

const renderForm = (
  deliveryPlanQuote: DeliveryPlanQuote,
  persistedSelection?: SelectedDeliveryPlan
) => (
  <NextIntlClientProvider locale="en-US" messages={messages}>
    <CheckoutShippingOptionsForm
      cart={cart}
      deliveryPlanQuote={deliveryPlanQuote}
      locale="en-US"
      saveAction={saveAction}
      selectedPlan={persistedSelection}
    />
  </NextIntlClientProvider>
);

describe(CheckoutShippingOptionsForm, () => {
  beforeAll(() => {
    vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  });

  afterEach(() => {
    act(() => {
      for (const root of roots.splice(0)) {
        root.unmount();
      }
    });
    document.body.replaceChildren();
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it("discards a persisted Shipping Option when the Delivery Plan Quote changes", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(renderForm(quote("quote-1"), selectedPlan));
    });

    const selectedOption = container.querySelector<HTMLInputElement>(
      'input[name="shipping-option-delivery-1"]'
    );
    expect(selectedOption?.checked).toBeTruthy();

    act(() => {
      root.render(renderForm(quote("quote-2")));
    });

    const refreshedOption = container.querySelector<HTMLInputElement>(
      'input[name="shipping-option-delivery-1"]'
    );
    const refreshedSaveButton = container.querySelector<HTMLButtonElement>(
      'button[type="submit"]'
    );
    expect(refreshedOption?.checked).toBeFalsy();
    expect(container.querySelector('input[name="selection"]')).toBeNull();
    expect(refreshedSaveButton?.disabled).toBeTruthy();
  });
});
