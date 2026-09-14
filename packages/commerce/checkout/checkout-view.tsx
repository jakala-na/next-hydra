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
  readonly activeStep: string;
  readonly attention: string;
  readonly cartTitle: string;
  readonly cartItems: (count: number) => string;
  readonly cartQuantity: (quantity: number) => string;
  readonly cartViolations: string;
  readonly delivery: (number: number) => string;
  readonly card: string;
  readonly edit: string;
  readonly editingStep: string;
  readonly netTerms: (days: number) => string;
  readonly paymentMethod: string;
  readonly subtotal: string;
  readonly stepLabels: Record<CheckoutStepId, string>;
  readonly stepStatuses: Record<
    CheckoutState["steps"][number]["status"],
    string
  >;
  readonly violation: (violation: CheckoutViolation) => string;
}

export function CheckoutSteps({
  checkoutPath,
  isEditing,
  messages,
  renderedStep,
  state,
}: {
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
    <nav aria-label="Checkout steps" className="sm:col-span-5">
      <ol className="grid gap-2 sm:grid-cols-5">
        {state.steps.map((step, index) => {
          const isActive = !isEditing && step.id === renderedStep;
          const isEdited = isEditing && step.id === renderedStep;
          const isCurrent = isActive || isEdited;
          let presentationState:
            | "active"
            | "complete"
            | "editing"
            | "incomplete" = step.status;
          let statusLabel = messages.stepStatuses[step.status];
          if (isEdited) {
            presentationState = "editing";
            statusLabel = messages.editingStep;
          } else if (isActive) {
            presentationState = "active";
            statusLabel = messages.activeStep;
          }
          const stepLabel = messages.stepLabels[step.id];

          return (
            <li
              aria-current={isCurrent ? "step" : undefined}
              className="rounded-md border border-border p-3 data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=complete]:bg-muted/50 data-[state=editing]:border-primary data-[state=editing]:bg-primary/5"
              data-checkout-step={step.id}
              data-state={presentationState}
              key={step.id}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-center gap-3">
                  <span
                    aria-hidden="true"
                    className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border font-medium text-xs data-[state=active]:border-primary data-[state=complete]:border-primary data-[state=editing]:border-primary data-[state=active]:bg-primary data-[state=complete]:bg-primary data-[state=editing]:bg-primary data-[state=active]:text-primary-foreground data-[state=complete]:text-primary-foreground data-[state=editing]:text-primary-foreground"
                    data-state={presentationState}
                  >
                    {index + 1}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate font-medium text-sm">
                      {stepLabel}
                    </span>
                    <span className="block text-muted-foreground text-xs">
                      {statusLabel}
                    </span>
                  </span>
                </div>
                {step.status === "complete" && index < renderedStepIndex ? (
                  <form action={checkoutPath} method="get">
                    <button
                      aria-label={`${messages.edit} ${stepLabel}`}
                      className="font-medium text-primary text-xs underline-offset-4 hover:underline"
                      name="edit"
                      type="submit"
                      value={step.id}
                    >
                      {messages.edit}
                    </button>
                  </form>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function CheckoutStepContent({
  actions,
  deliveryPlanQuote,
  isEditing,
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
  readonly isEditing: boolean;
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
    <section className="min-h-80 rounded-md border border-border p-6 sm:col-span-3">
      <div className="mb-6 border-border border-b pb-4">
        <p className="text-muted-foreground text-sm">
          {isEditing ? messages.editingStep : messages.activeStep}
        </p>
        <h1 className="font-semibold text-2xl">
          {messages.stepLabels[renderedStep]}
        </h1>
      </div>
      <CheckoutStepViolations
        messages={messages}
        step={renderedStep}
        violations={state.violations}
      />
      {content}
    </section>
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
    <aside className="rounded-md border border-border p-6 sm:col-span-2">
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
    activeStep: t("activeStep"),
    attention: t("attention"),
    card: t("paymentOptions.card"),
    cartItems: (count) => t("cart.items", { count }),
    cartQuantity: (quantity) => t("cart.quantity", { quantity }),
    cartTitle: t("cart.title"),
    cartViolations: t("cart.violations"),
    delivery: (number) => t("shippingOptions.delivery", { number }),
    edit: t("actions.edit"),
    editingStep: t("editingStep"),
    netTerms: (days) => t("paymentOptions.netTerms", { days }),
    paymentMethod: t("paymentOptions.paymentMethod"),
    stepLabels: {
      contact: t("steps.contact"),
      deliveryDetails: t("steps.deliveryDetails"),
      paymentOptions: t("steps.paymentOptions"),
      reviewOrder: t("steps.reviewOrder"),
      shippingOptions: t("steps.shippingOptions"),
    },
    stepStatuses: {
      complete: t("status.complete"),
      incomplete: t("status.incomplete"),
    },
    subtotal: t("cart.subtotal"),
    violation: (violation) =>
      checkoutViolationMessage(checkoutLocale, violation),
  };
  const renderedStep = checkoutRenderedStepFor(state, editedStep);
  const isEditing = editedStep !== undefined;

  return (
    <main
      className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:grid-cols-5"
      data-checkout-cart-id={state.cart.id}
    >
      <CheckoutSteps
        checkoutPath={checkoutPath}
        isEditing={isEditing}
        messages={messages}
        renderedStep={renderedStep}
        state={state}
      />
      <CheckoutStepContent
        actions={actions}
        deliveryPlanQuote={deliveryPlanQuote}
        isEditing={isEditing}
        messages={messages}
        paymentOptions={paymentOptions}
        renderPaymentOptions={renderPaymentOptions}
        renderPlaceOrder={renderPlaceOrder}
        renderedStep={renderedStep}
        shippingAddressOptions={shippingAddressOptions}
        state={state}
      />
      <CartSidebar messages={messages} state={state} />
    </main>
  );
}
