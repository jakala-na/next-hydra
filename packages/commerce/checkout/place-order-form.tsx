"use client";

import {
  startTransition,
  useActionState,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type { CartId } from "../domain/cart";
import type { OrderPlacementResult } from "../domain/order";
import type { PlaceCheckoutOrderAction } from "./action-contract";
import { paymentMethodLabel } from "./payment-method-label";

export type CompleteCheckoutPaymentAction = (
  action: Extract<
    OrderPlacementResult,
    { readonly _tag: "PaymentActionRequired" }
  >["paymentAction"]
) => Promise<{ readonly message?: string; readonly succeeded: boolean }>;

export interface CheckoutPlaceOrderFormProps {
  readonly cartId: CartId;
  readonly completePaymentAction?: CompleteCheckoutPaymentAction;
  readonly placeOrderAction: PlaceCheckoutOrderAction;
  readonly refreshCheckout?: () => void;
}

interface PlaceOrderFormState {
  readonly result: Awaited<ReturnType<PlaceCheckoutOrderAction>> | null;
  readonly revision: number;
}

const INITIAL_PLACE_ORDER_FORM_STATE: PlaceOrderFormState = {
  result: null,
  revision: 0,
};

const refreshBrowserCheckout = () => {
  globalThis.location.reload();
};

const checkoutRefreshRequired = (result: PlaceOrderFormState["result"]) =>
  result?._tag === "Failure" &&
  (result.failure.error._tag === "CheckoutPaymentRejected" ||
    result.failure.error._tag === "CheckoutPaymentPreparationRefreshRequired" ||
    result.failure.error._tag === "CheckoutOrderPlacementUnavailable");

const formatMoney = (
  money: Extract<
    OrderPlacementResult,
    { readonly _tag: "Placed" }
  >["order"]["totalPrice"]
) =>
  new Intl.NumberFormat("en-US", {
    currency: money.currencyCode,
    style: "currency",
  }).format(money.centAmount / 100);

export function CheckoutPlaceOrderForm({
  cartId,
  completePaymentAction,
  placeOrderAction,
  refreshCheckout = refreshBrowserCheckout,
}: CheckoutPlaceOrderFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const handledClientToken = useRef<string | undefined>(undefined);
  const [clientFailure, setClientFailure] = useState<string>();
  const [isCompletingPayment, setIsCompletingPayment] = useState(false);
  const placeOrderReducer = useCallback(
    async (
      previousState: PlaceOrderFormState,
      formData: FormData
    ): Promise<PlaceOrderFormState> => ({
      result: await placeOrderAction(previousState.result, formData),
      revision: previousState.revision + 1,
    }),
    [placeOrderAction]
  );
  const [actionState, formAction, isPending] = useActionState(
    placeOrderReducer,
    INITIAL_PLACE_ORDER_FORM_STATE
  );
  const actionResult = actionState.result;
  const placement =
    actionResult?._tag === "Success" ? actionResult.success : undefined;

  useEffect(() => {
    if (checkoutRefreshRequired(actionResult)) {
      refreshCheckout();
    }
  }, [actionResult, refreshCheckout]);

  useEffect(() => {
    if (
      placement?._tag !== "PaymentActionRequired" ||
      handledClientToken.current === placement.paymentAction.clientToken
    ) {
      return;
    }
    handledClientToken.current = placement.paymentAction.clientToken;
    setIsCompletingPayment(true);
    setClientFailure(undefined);
    void (
      completePaymentAction?.(placement.paymentAction) ??
      Promise.resolve({
        message: "This Card action cannot be completed in the current client.",
        succeeded: false,
      })
    )
      .then((completion) => {
        if (!completion.succeeded) {
          handledClientToken.current = undefined;
          setClientFailure(
            completion.message ?? "Card authentication was not completed."
          );
          return;
        }
        const form = formRef.current;
        if (form !== null) {
          startTransition(() => {
            formAction(new FormData(form));
          });
        }
      })
      .catch(() => {
        handledClientToken.current = undefined;
        setClientFailure("Card authentication could not be completed.");
      })
      .finally(() => {
        setIsCompletingPayment(false);
      });
  }, [actionState.revision, completePaymentAction, formAction, placement]);

  if (placement?._tag === "Placed") {
    return (
      <section
        className="grid gap-3"
        data-order-confirmation={placement.order.id}
      >
        <h2 className="font-semibold text-xl">Order confirmed</h2>
        <p>Order {placement.order.number}</p>
        <p data-order-payment-method>
          {paymentMethodLabel(placement.order.paymentMethod)}
        </p>
        <p
          data-commerce-money="order-total"
          data-currency={placement.order.totalPrice.currencyCode}
          data-minor-amount={placement.order.totalPrice.centAmount}
        >
          {formatMoney(placement.order.totalPrice)}
        </p>
        {placement.paymentStatus === "pending" ? (
          <output>Payment finalization is pending.</output>
        ) : null}
      </section>
    );
  }

  const failure =
    actionResult?._tag === "Failure"
      ? actionResult.failure.displayMessage
      : clientFailure;
  const busy = isPending || isCompletingPayment;

  return (
    <form action={formAction} className="grid gap-4" ref={formRef}>
      <input name="cartId" type="hidden" value={cartId} />
      {failure === undefined ? null : (
        <p className="text-destructive text-sm" role="alert">
          {failure}
        </p>
      )}
      {placement?._tag === "PlacementPending" ? (
        <output>
          Order placement is still being confirmed. Retry to recover it.
        </output>
      ) : null}
      <button
        className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm disabled:opacity-50"
        disabled={busy}
        type="submit"
      >
        {busy ? "Placing order…" : "Place order"}
      </button>
    </form>
  );
}
