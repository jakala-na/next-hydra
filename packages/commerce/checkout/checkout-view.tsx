import { getTranslations } from "@repo/i18n";
import type { Locale } from "@repo/i18n/types";
import type { PaymentMethod, PaymentOptions } from "@repo/payments";
import type { ReactNode } from "react";

import { toCartReadModel } from "../cart/public-state";
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
import { CheckoutShippingOptionsForm } from "./shipping-options-form";
import { ActiveStepViolations, CartSidebarViolations } from "./violations";

const CENTS_PER_MAJOR_CURRENCY_UNIT = 100;

const formatMoney = (
  money: { readonly centAmount: number; readonly currencyCode: string },
  locale: string
) =>
  new Intl.NumberFormat(locale, {
    currency: money.currencyCode,
    style: "currency",
  }).format(money.centAmount / CENTS_PER_MAJOR_CURRENCY_UNIT);

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
  readonly editDeliveryDetails: string;
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

function CheckoutSteps({
  messages,
  state,
}: {
  readonly messages: CheckoutPageMessages;
  readonly state: CheckoutState;
}) {
  return (
    <ol className="grid gap-2 sm:col-span-5 sm:grid-cols-5">
      {state.steps.map((step, index) => {
        const isActive = step.id === state.activeStep;
        const presentationState = isActive ? "active" : step.status;
        const statusLabel = isActive
          ? messages.activeStep
          : messages.stepStatuses[step.status];

        return (
          <li
            aria-current={isActive ? "step" : undefined}
            className="rounded-md border border-border p-3 data-[state=active]:border-primary data-[state=active]:bg-primary/5 data-[state=complete]:bg-muted/50"
            data-state={presentationState}
            key={step.id}
          >
            <div className="flex items-center gap-3">
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full border border-border font-medium text-xs data-[state=active]:border-primary data-[state=complete]:border-primary data-[state=active]:bg-primary data-[state=complete]:bg-primary data-[state=active]:text-primary-foreground data-[state=complete]:text-primary-foreground"
                data-state={presentationState}
              >
                {index + 1}
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium text-sm">
                  {messages.stepLabels[step.id]}
                </span>
                <span className="block text-muted-foreground text-xs">
                  {statusLabel}
                </span>
              </span>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function ActiveStep({
  actions,
  deliveryPlanQuote,
  messages,
  paymentOptions,
  renderPaymentOptions,
  renderPlaceOrder,
  shippingAddressOptions,
  state,
}: {
  readonly actions: CheckoutActions;
  readonly deliveryPlanQuote: DeliveryPlanQuote;
  readonly messages: CheckoutPageMessages;
  readonly paymentOptions?: PaymentOptions;
  readonly renderPaymentOptions: CheckoutPaymentOptionsRenderer;
  readonly renderPlaceOrder: CheckoutPlaceOrderRenderer;
  readonly shippingAddressOptions?: readonly CheckoutShippingAddressOption[];
  readonly state: CheckoutState;
}) {
  let content: ReactNode = null;
  const shippingOptionsComplete =
    state.steps.find((step) => step.id === "shippingOptions")?.status ===
    "complete";
  const deliveryDetailsComplete =
    state.steps.find((step) => step.id === "deliveryDetails")?.status ===
    "complete";

  if (state.activeStep === "contact") {
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
  } else if (state.activeStep === "deliveryDetails") {
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
  } else if (state.activeStep === "shippingOptions") {
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
    state.activeStep === "paymentOptions" &&
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
    state.activeStep === "reviewOrder" &&
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
        <p className="text-muted-foreground text-sm">{messages.activeStep}</p>
        <h1 className="font-semibold text-2xl">
          {messages.stepLabels[state.activeStep]}
        </h1>
      </div>
      <ActiveStepViolations
        activeStep={state.activeStep}
        messages={messages}
        violations={state.violations}
      />
      {deliveryDetailsComplete &&
      state.activeStep !== "contact" &&
      state.activeStep !== "deliveryDetails" ? (
        <details className="mb-6 rounded-md border border-border p-4">
          <summary className="cursor-pointer font-medium text-sm">
            {messages.editDeliveryDetails}
          </summary>
          <div className="mt-4 border-border border-t pt-4">
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
          </div>
        </details>
      ) : null}
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
  const merchandiseSubtotal = toCartReadModel(state.cart).summary.subtotal;

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
  deliveryPlanQuote,
  locale,
  paymentOptions,
  renderPaymentOptions,
  renderPlaceOrder,
  shippingAddressOptions,
  state,
}: {
  readonly actions: CheckoutActions;
  readonly deliveryPlanQuote: DeliveryPlanQuote;
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
    editDeliveryDetails: t("deliveryDetails.actions.edit"),
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

  return (
    <main
      className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:grid-cols-5"
      data-checkout-cart-id={state.cart.id}
    >
      <CheckoutSteps messages={messages} state={state} />
      <ActiveStep
        actions={actions}
        deliveryPlanQuote={deliveryPlanQuote}
        messages={messages}
        paymentOptions={paymentOptions}
        renderPaymentOptions={renderPaymentOptions}
        renderPlaceOrder={renderPlaceOrder}
        shippingAddressOptions={shippingAddressOptions}
        state={state}
      />
      <CartSidebar messages={messages} state={state} />
    </main>
  );
}
