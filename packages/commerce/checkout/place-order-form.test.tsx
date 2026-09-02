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
import { CheckoutPlaceOrderForm } from "./place-order-form";

type CheckoutPlaceOrderFormProps = Parameters<typeof CheckoutPlaceOrderForm>[0];
type CompleteCheckoutPaymentAction = NonNullable<
  CheckoutPlaceOrderFormProps["completePaymentAction"]
>;

const roots: ReturnType<typeof createRoot>[] = [];

describe(CheckoutPlaceOrderForm, () => {
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

  it("retries the same client Payment action after a local completion failure", async () => {
    const actionRequired = {
      _tag: "Success" as const,
      success: {
        _tag: "PaymentActionRequired" as const,
        paymentAction: {
          clientToken: "client-token-from-action",
          method: "card" as const,
          provider: "Stripe",
          publicConfiguration: "public-configuration-from-action",
        },
      },
    };
    const placeOrderAction = vi.fn<
      CheckoutPlaceOrderFormProps["placeOrderAction"]
    >(async () => await Promise.resolve(actionRequired));
    const completePaymentAction = vi.fn<CompleteCheckoutPaymentAction>(
      async () => await Promise.resolve({ succeeded: false })
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <CheckoutPlaceOrderForm
          cartId={CartId.make("cart-1")}
          completePaymentAction={completePaymentAction}
          placeOrderAction={placeOrderAction}
        />
      );
    });

    const form = container.querySelector("form");
    if (form === null) {
      throw new Error("Expected Place Order form");
    }

    act(() => {
      form.requestSubmit();
    });
    await vi.waitFor(() => {
      expect(completePaymentAction).toHaveBeenCalledOnce();
    });

    act(() => {
      form.requestSubmit();
    });
    await vi.waitFor(() => {
      expect(completePaymentAction).toHaveBeenCalledTimes(2);
    });
  });

  it("refreshes Checkout after a rejected Payment selection is cleared", async () => {
    const refreshCheckout = vi.fn<() => void>();
    const placeOrderAction = vi.fn<
      CheckoutPlaceOrderFormProps["placeOrderAction"]
    >(
      async () =>
        await Promise.resolve({
          _tag: "Failure" as const,
          failure: {
            displayMessage: "Card authentication was rejected.",
            error: {
              _tag: "CheckoutPaymentRejected" as const,
              category: "conflict" as const,
              code: "checkout.orderPlacement.paymentRejected" as const,
              message: "Card authentication was rejected.",
              operation: "authorize" as const,
              recovery: "fix_input" as const,
            },
          },
        })
    );
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push(root);

    act(() => {
      root.render(
        <CheckoutPlaceOrderForm
          cartId={CartId.make("cart-1")}
          placeOrderAction={placeOrderAction}
          refreshCheckout={refreshCheckout}
        />
      );
    });

    const form = container.querySelector("form");
    if (form === null) {
      throw new Error("Expected Place Order form");
    }
    act(() => {
      form.requestSubmit();
    });

    await vi.waitFor(() => {
      expect(refreshCheckout).toHaveBeenCalledOnce();
    });
  });
});
