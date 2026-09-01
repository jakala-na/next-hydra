import { NextIntlClientProvider } from "@repo/i18n";
import messages from "@repo/i18n/messages/en-US.json";
import { PaymentProvider, PreparedPaymentReference } from "@repo/payments";
import { Effect } from "effect";
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

import { CartId } from "../domain/cart";
import type { SaveCheckoutPaymentOptionsAction } from "./action-contract";
import type { CardPaymentPreparationResult } from "./payment-options-form";
import { CheckoutPaymentOptionsForm } from "./payment-options-form";

const roots: ReturnType<typeof createRoot>[] = [];

describe(CheckoutPaymentOptionsForm, () => {
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

  it("prepares Card details only once while a submission is in progress", () => {
    const pendingPreparation: Promise<CardPaymentPreparationResult> =
      Effect.runPromise(Effect.never);
    const prepare = vi.fn<() => Promise<CardPaymentPreparationResult>>(
      async () => await pendingPreparation
    );
    const saveAction = vi.fn<SaveCheckoutPaymentOptionsAction>(
      async () =>
        await Promise.reject(
          new Error("The pending preparation must not submit")
        )
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <NextIntlClientProvider locale="en-US" messages={messages}>
          <CheckoutPaymentOptionsForm
            card={{ fields: <span>Card fields</span>, prepare, ready: true }}
            cartId={CartId.make("cart-from-input")}
            locale="en-US"
            options={{
              amount: { centAmount: 1_700_000, currencyCode: "USD" },
              methods: [
                {
                  availability: "available",
                  displayName: "Card",
                  input: {
                    clientIntegration: {
                      clientToken: "client-token-from-input",
                      provider: PaymentProvider.make("Stripe"),
                      publicConfiguration: "public-configuration-from-input",
                    },
                    preparationReference: PreparedPaymentReference.make(
                      "preparation-reference-from-input"
                    ),
                  },
                  method: "card",
                },
              ],
            }}
            saveAction={saveAction}
          />
        </NextIntlClientProvider>
      );
    });

    const form = container.querySelector("form");
    if (form === null) {
      throw new Error("Expected Payment Options form");
    }

    act(() => {
      form.requestSubmit();
      form.requestSubmit();
    });

    expect(prepare).toHaveBeenCalledOnce();
    expect(saveAction).not.toHaveBeenCalled();
    expect(
      container.querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.disabled
    ).toBeTruthy();
  });

  it("renders an available non-Card method without Card preparation", () => {
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);
    const saveAction = vi.fn<SaveCheckoutPaymentOptionsAction>(
      async () =>
        await Promise.reject(new Error("Payment Options must not submit"))
    );

    act(() => {
      root.render(
        <NextIntlClientProvider locale="en-US" messages={messages}>
          <CheckoutPaymentOptionsForm
            cartId={CartId.make("cart-from-input")}
            locale="en-US"
            options={{
              amount: { centAmount: 1_700_000, currencyCode: "USD" },
              methods: [
                {
                  availability: "available",
                  availableCredit: {
                    centAmount: 2_000_000,
                    currencyCode: "USD",
                  },
                  displayName: "Net 30",
                  method: "netTerms",
                  termsInDays: 30,
                },
              ],
            }}
            saveAction={saveAction}
          />
        </NextIntlClientProvider>
      );
    });

    expect(
      container.querySelector('input[name="preparationReference"]')
    ).toBeNull();
    expect(
      container.querySelector<HTMLInputElement>(
        '[data-payment-method="netTerms"] input[type="radio"]'
      )?.checked
    ).toBeTruthy();
    expect(
      container.querySelector<HTMLButtonElement>('button[type="submit"]')
        ?.disabled
    ).toBeFalsy();
  });
});
