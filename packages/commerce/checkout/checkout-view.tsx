import { getTranslations } from "@repo/i18n";
import type { Locale } from "@repo/i18n/types";
import type { PaymentMethod, PaymentOptions } from "@repo/payments";
import type { ReactNode } from "react";

import type { Address } from "../domain/address";
import type { CartId } from "../domain/cart";
import type { CheckoutStepId, CheckoutViolation } from "../domain/checkout";
import type { CheckoutState } from "../domain/checkout-state";
import type { DeliveryPlanQuote } from "../domain/delivery-plan";
import { checkoutViolationMessage } from "../lib/checkout/violation-message";
import { CommerceLocale } from "../store";
import type {
  PlaceCheckoutOrderAction,
  SaveCheckoutContactAction,
  SaveCheckoutDeliveryDetailsAction,
  SaveCheckoutPaymentOptionsAction,
  SaveCheckoutShippingOptionsAction,
} from "./action-contract";
import { CheckoutLayout } from "./checkout-layout";
import { CheckoutContactForm } from "./contact-form";
import { CheckoutDeliveryDetailsForm } from "./delivery-details-form";
import type { CheckoutShippingAddressOption } from "./delivery-details-form";
import type { CheckoutEditStepId } from "./edit-step";
import { checkoutRenderedStepFor } from "./edit-step";
import { CheckoutShippingOptionsForm } from "./shipping-options-form";
import { CartSidebarViolations, CheckoutStepViolations } from "./violations";

const CENTS_PER_MAJOR_CURRENCY_UNIT = 100;

const formatMoney = (
  money: CheckoutState["cart"]["totalPrice"],
  locale: string
) =>
  new Intl.NumberFormat(locale, {
    currency: money.currencyCode,
    style: "currency",
  }).format(money.centAmount / CENTS_PER_MAJOR_CURRENCY_UNIT);

const merchandiseSubtotalFor = (
  cart: CheckoutState["cart"]
): CheckoutState["cart"]["totalPrice"] => ({
  centAmount: cart.lineItems.reduce(
    (subtotal, lineItem) =>
      subtotal +
      (lineItem.totalPrice?.centAmount ??
        lineItem.unitPrice.centAmount * lineItem.quantity),
    0
  ),
  currencyCode: cart.totalPrice.currencyCode,
});

interface CheckoutActions {
  readonly placeOrder: PlaceCheckoutOrderAction;
  readonly saveContact: SaveCheckoutContactAction;
  readonly saveDeliveryDetails: SaveCheckoutDeliveryDetailsAction;
  readonly savePaymentOptions: SaveCheckoutPaymentOptionsAction;
  readonly saveShippingOptions: SaveCheckoutShippingOptionsAction;
}

export interface CheckoutPaymentOptionsRendererProps {
  readonly billingAddress: Address;
  readonly cartId: CartId;
  readonly locale: Locale;
  readonly options: PaymentOptions;
  readonly saveAction: SaveCheckoutPaymentOptionsAction;
  readonly selectedMethod?: PaymentMethod;
}

export type CheckoutPaymentOptionsRenderer = (
  props: CheckoutPaymentOptionsRendererProps
) => ReactNode;

export interface CheckoutPlaceOrderRendererProps {
  readonly cartId: CartId;
  readonly placeOrderAction: PlaceCheckoutOrderAction;
}

export type CheckoutPlaceOrderRenderer = (
  props: CheckoutPlaceOrderRendererProps
) => ReactNode;

export interface CheckoutPageMessages {
  readonly attention: string;
  readonly cartTitle: string;
  readonly cartItems: (count: number) => string;
  readonly cartQuantity: (quantity: number) => string;
  readonly cartViolations: string;
  readonly delivery: (number: number) => string;
  readonly card: string;
  readonly edit: string;
  readonly netTerms: (days: number) => string;
  readonly paymentMethod: string;
  readonly subtotal: string;
  readonly stepLabels: Record<CheckoutStepId, string>;
  readonly title: string;
  readonly violation: (violation: CheckoutViolation) => string;
}

function checkoutStepSummary(
  step: CheckoutStepId,
  state: CheckoutState,
  messages: CheckoutPageMessages
): string | undefined {
  switch (step) {
    case "contact": {
      const contact = state.details.contact?.buyerContact;
      return contact
        ? [
            `${contact.firstName} ${contact.lastName}`,
            contact.email,
            contact.phoneNumber,
          ]
            .filter(Boolean)
            .join(" · ")
        : undefined;
    }
    case "deliveryDetails": {
      const address = state.details.deliveryDetails?.shippingAddress;
      return address
        ? [
            address.addressLine1,
            address.addressLine2,
            address.city,
            address.region,
            address.postalCode,
            new Intl.DisplayNames([state.scope.locale], {
              type: "region",
            }).of(address.country),
          ]
            .filter(Boolean)
            .join(", ")
        : undefined;
    }
    case "shippingOptions": {
      return state.details.selectedDeliveryPlan?.groups
        .map((group) => group.selectedShippingOption.name)
        .join(" · ");
    }
    case "paymentOptions": {
      const payment = state.details.preparedPayment;
      if (payment === undefined) {
        return undefined;
      }
      return payment.method === "card"
        ? messages.card
        : messages.netTerms(payment.termsInDays);
    }
    case "reviewOrder": {
      return undefined;
    }
    default: {
      throw new Error("Unknown Checkout Step");
    }
  }
}

export function CheckoutSteps({
  children,
  checkoutPath,
  isEditing,
  messages,
  renderedStep,
  state,
}: {
  readonly children: ReactNode;
  readonly checkoutPath: string;
  readonly isEditing: boolean;
  readonly messages: CheckoutPageMessages;
  readonly renderedStep: CheckoutStepId;
  readonly state: CheckoutState;
}) {
  const renderedStepIndex = state.steps.findIndex(
    (step) => step.id === renderedStep
  );

  return (
    <ol
      aria-label={messages.title}
      className="divide-y divide-border rounded-lg border border-border"
    >
      {state.steps.map((step, index) => {
        const isCurrent = step.id === renderedStep;
        let presentationState:
          | "active"
          | "complete"
          | "editing"
          | "incomplete" = step.status;
        if (isCurrent) {
          presentationState = isEditing ? "editing" : "active";
        }
        const stepLabel = messages.stepLabels[step.id];
        const summary =
          !isCurrent && step.status === "complete"
            ? checkoutStepSummary(step.id, state, messages)
            : undefined;

        return (
          <li
            aria-current={isCurrent ? "step" : undefined}
            className="scroll-mt-8 p-5 sm:p-6"
            data-checkout-step={step.id}
            data-state={presentationState}
            id={`checkout-${step.id}`}
            key={step.id}
          >
            <section aria-labelledby={`checkout-${step.id}-heading`}>
              <div className="flex items-start justify-between gap-4">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-8 shrink-0 items-center justify-center rounded-full border border-border font-medium text-sm data-[state=active]:border-primary data-[state=editing]:border-primary data-[state=active]:bg-primary data-[state=editing]:bg-primary data-[state=active]:text-primary-foreground data-[state=editing]:text-primary-foreground"
                    data-state={presentationState}
                  >
                    {index + 1}
                  </span>
                  <div className="min-w-0">
                    <h2
                      className="font-semibold text-lg"
                      id={`checkout-${step.id}-heading`}
                    >
                      {stepLabel}
                    </h2>
                    {summary ? (
                      <p className="mt-1 break-words text-muted-foreground text-sm">
                        {summary}
                      </p>
                    ) : null}
                  </div>
                </div>
                {step.status === "complete" && index < renderedStepIndex ? (
                  <form action={checkoutPath} method="get">
                    <button
                      aria-label={`${messages.edit} ${stepLabel}`}
                      className="min-h-8 shrink-0 rounded-sm font-medium text-primary text-sm underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-ring"
                      name="edit"
                      type="submit"
                      value={step.id}
                    >
                      {messages.edit}
                    </button>
                  </form>
                ) : null}
              </div>
              {isCurrent ? (
                <div className="mt-6" data-checkout-step-content={step.id}>
                  {children}
                </div>
              ) : null}
            </section>
          </li>
        );
      })}
    </ol>
  );
}

function CheckoutStepContent({
  actions,
  deliveryPlanQuote,
  messages,
  paymentOptions,
  renderPaymentOptions,
  renderPlaceOrder,
  renderedStep,
  shippingAddressOptions,
  state,
}: {
  readonly actions: CheckoutActions;
  readonly deliveryPlanQuote: DeliveryPlanQuote;
  readonly messages: CheckoutPageMessages;
  readonly paymentOptions?: PaymentOptions;
  readonly renderPaymentOptions: CheckoutPaymentOptionsRenderer;
  readonly renderPlaceOrder: CheckoutPlaceOrderRenderer;
  readonly renderedStep: CheckoutStepId;
  readonly shippingAddressOptions?: readonly CheckoutShippingAddressOption[];
  readonly state: CheckoutState;
}) {
  let content: ReactNode = null;
  const shippingOptionsComplete =
    state.steps.find((step) => step.id === "shippingOptions")?.status ===
    "complete";

  if (renderedStep === "contact") {
    content = (
      <CheckoutContactForm
        buyerContact={state.details.contact?.buyerContact}
        cartId={state.cart.id}
        saveAction={actions.saveContact}
        source={
          state.scope.channel === "storefrontCustomer"
            ? "customerProfile"
            : "manual"
        }
      />
    );
  } else if (renderedStep === "deliveryDetails") {
    content = (
      <CheckoutDeliveryDetailsForm
        addressBookReference={
          state.details.deliveryDetails?.source === "addressBook"
            ? state.details.deliveryDetails.addressBookReference
            : undefined
        }
        cartId={state.cart.id}
        saveAction={actions.saveDeliveryDetails}
        shippingAddress={state.details.deliveryDetails?.shippingAddress}
        shippingAddressOptions={shippingAddressOptions}
      />
    );
  } else if (renderedStep === "shippingOptions") {
    content = (
      <CheckoutShippingOptionsForm
        cart={state.cart}
        deliveryPlanQuote={deliveryPlanQuote}
        locale={state.scope.locale}
        saveAction={actions.saveShippingOptions}
        selectedPlan={
          shippingOptionsComplete
            ? state.details.selectedDeliveryPlan
            : undefined
        }
      />
    );
  } else if (
    renderedStep === "paymentOptions" &&
    paymentOptions !== undefined &&
    state.details.deliveryDetails !== undefined
  ) {
    content = renderPaymentOptions({
      billingAddress: state.details.deliveryDetails.shippingAddress,
      cartId: state.cart.id,
      locale: state.scope.locale,
      options: paymentOptions,
      saveAction: actions.savePaymentOptions,
      selectedMethod: state.details.preparedPayment?.method,
    });
  } else if (
    renderedStep === "reviewOrder" &&
    state.details.preparedPayment !== undefined
  ) {
    const payment = state.details.preparedPayment;
    content = (
      <div className="grid gap-4">
        <section className="grid gap-2 rounded-md border border-border p-4">
          <h2 className="font-semibold">{messages.paymentMethod}</h2>
          <p data-selected-payment-method={payment.method}>
            {payment.method === "card"
              ? messages.card
              : messages.netTerms(payment.termsInDays)}
          </p>
          <p
            data-commerce-money="prepared-payment"
            data-currency={payment.amount.currencyCode}
            data-minor-amount={payment.amount.centAmount}
          >
            {formatMoney(payment.amount, state.scope.locale)}
          </p>
        </section>
        {renderPlaceOrder({
          cartId: state.cart.id,
          placeOrderAction: actions.placeOrder,
        })}
      </div>
    );
  }

  return (
    <>
      <CheckoutStepViolations
        messages={messages}
        step={renderedStep}
        violations={state.violations}
      />
      {content}
    </>
  );
}

export function CartSidebar({
  messages,
  state,
}: {
  readonly messages: CheckoutPageMessages;
  readonly state: CheckoutState;
}) {
  const { locale } = state.scope;
  const shippingOptionsComplete =
    state.steps.find((step) => step.id === "shippingOptions")?.status ===
    "complete";
  const merchandiseSubtotal = merchandiseSubtotalFor(state.cart);

  return (
    <aside className="rounded-lg border border-border p-5 sm:p-6">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="font-semibold text-lg">{messages.cartTitle}</h2>
        <span className="text-muted-foreground text-sm">
          {messages.cartItems(state.cart.totalLineItemQuantity)}
        </span>
      </div>
      <ul className="grid gap-4">
        {state.cart.lineItems.map((lineItem) => (
          <li className="border-border border-b pb-4" key={lineItem.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-sm">
                  {lineItem.variant.name ?? lineItem.variant.productId}
                </p>
                <p className="text-muted-foreground text-sm">
                  {messages.cartQuantity(lineItem.quantity)}
                </p>
              </div>
              <p className="whitespace-nowrap text-sm">
                {lineItem.totalPrice
                  ? formatMoney(lineItem.totalPrice, locale)
                  : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
      <CartSidebarViolations
        messages={messages}
        violations={state.violations}
      />
      <div className="mt-5 flex items-center justify-between border-border border-t pt-4">
        <span className="font-medium text-sm">{messages.subtotal}</span>
        <span
          className="font-semibold text-sm"
          data-commerce-money="checkout-subtotal"
          data-currency={merchandiseSubtotal.currencyCode}
          data-minor-amount={merchandiseSubtotal.centAmount}
        >
          {formatMoney(merchandiseSubtotal, locale)}
        </span>
      </div>
      {!shippingOptionsComplete ||
      state.details.selectedDeliveryPlan === undefined ? null : (
        <div className="mt-5 grid gap-3 border-border border-t pt-4">
          {state.details.selectedDeliveryPlan.groups.map((group, index) => (
            <div
              className="flex items-center justify-between gap-4 text-sm"
              data-selected-delivery-group={group.reference}
              key={group.reference}
            >
              <span>
                <span className="block font-medium">
                  {messages.delivery(index + 1)}
                </span>
                <span
                  className="block text-muted-foreground"
                  data-selected-shipping-option={
                    group.selectedShippingOption.reference
                  }
                >
                  {group.selectedShippingOption.name}
                </span>
              </span>
              <span
                data-commerce-money="selected-shipping-option"
                data-currency={group.selectedShippingOption.price.currencyCode}
                data-minor-amount={
                  group.selectedShippingOption.price.centAmount
                }
              >
                {formatMoney(group.selectedShippingOption.price, locale)}
              </span>
            </div>
          ))}
        </div>
      )}
    </aside>
  );
}

export async function CheckoutView({
  actions,
  checkoutPath,
  deliveryPlanQuote,
  editedStep,
  locale,
  paymentOptions,
  renderPaymentOptions,
  renderPlaceOrder,
  shippingAddressOptions,
  state,
}: {
  readonly actions: CheckoutActions;
  readonly checkoutPath: string;
  readonly deliveryPlanQuote: DeliveryPlanQuote;
  readonly editedStep?: CheckoutEditStepId;
  readonly locale: Locale;
  readonly paymentOptions?: PaymentOptions;
  readonly renderPaymentOptions: CheckoutPaymentOptionsRenderer;
  readonly renderPlaceOrder: CheckoutPlaceOrderRenderer;
  readonly shippingAddressOptions?: readonly CheckoutShippingAddressOption[];
  readonly state: CheckoutState;
}) {
  const t = await getTranslations({ locale, namespace: "web.checkout" });

  const checkoutLocale = CommerceLocale.make(locale);
  const messages: CheckoutPageMessages = {
    attention: t("attention"),
    card: t("paymentOptions.card"),
    cartItems: (count) => t("cart.items", { count }),
    cartQuantity: (quantity) => t("cart.quantity", { quantity }),
    cartTitle: t("cart.title"),
    cartViolations: t("cart.violations"),
    delivery: (number) => t("shippingOptions.delivery", { number }),
    edit: t("actions.edit"),
    netTerms: (days) => t("paymentOptions.netTerms", { days }),
    paymentMethod: t("paymentOptions.paymentMethod"),
    stepLabels: {
      contact: t("steps.contact"),
      deliveryDetails: t("steps.deliveryDetails"),
      paymentOptions: t("steps.paymentOptions"),
      reviewOrder: t("steps.reviewOrder"),
      shippingOptions: t("steps.shippingOptions"),
    },
    subtotal: t("cart.subtotal"),
    title: t("title"),
    violation: (violation) =>
      checkoutViolationMessage(checkoutLocale, violation),
  };
  const renderedStep = checkoutRenderedStepFor(state, editedStep);
  const isEditing = editedStep !== undefined;

  return (
    <CheckoutLayout
      cart={<CartSidebar messages={messages} state={state} />}
      cartId={state.cart.id}
      title={messages.title}
    >
      <CheckoutSteps
        checkoutPath={checkoutPath}
        isEditing={isEditing}
        messages={messages}
        renderedStep={renderedStep}
        state={state}
      >
        <CheckoutStepContent
          actions={actions}
          deliveryPlanQuote={deliveryPlanQuote}
          messages={messages}
          paymentOptions={paymentOptions}
          renderPaymentOptions={renderPaymentOptions}
          renderPlaceOrder={renderPlaceOrder}
          renderedStep={renderedStep}
          shippingAddressOptions={shippingAddressOptions}
          state={state}
        />
      </CheckoutSteps>
    </CheckoutLayout>
  );
}
