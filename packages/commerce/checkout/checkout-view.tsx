import { getTranslations } from "@repo/i18n";
import type { Locale } from "@repo/i18n/types";
import type { ReactNode } from "react";
import type {
  CheckoutState,
  CheckoutStepId,
  CheckoutViolation,
} from "../domain/checkout";
import { checkoutViolationMessage } from "../lib/checkout/violation-message";
import { CommerceLocale } from "../store";
import { CheckoutContactForm } from "./contact-form";
import {
  CheckoutDeliveryDetailsForm,
  type CheckoutShippingAddressOption,
} from "./delivery-details-form";
import type { SaveCheckoutContactAction } from "./save-contact-state";
import type { SaveCheckoutDeliveryDetailsAction } from "./save-delivery-details-state";
import { ActiveStepViolations, CartSidebarViolations } from "./violations";

const CENTS_PER_MAJOR_CURRENCY_UNIT = 100;

const formatMoney = (
  money: CheckoutState["cart"]["totalPrice"],
  locale: string
) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currencyCode,
  }).format(money.centAmount / CENTS_PER_MAJOR_CURRENCY_UNIT);

interface CheckoutActions {
  readonly saveContact: SaveCheckoutContactAction;
  readonly saveDeliveryDetails: SaveCheckoutDeliveryDetailsAction;
}

interface CheckoutPageMessages {
  readonly activeStep: string;
  readonly attention: string;
  readonly cartTitle: string;
  readonly cartItems: (count: number) => string;
  readonly cartQuantity: (quantity: number) => string;
  readonly cartViolations: string;
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
  messages,
  shippingAddressOptions,
  state,
}: {
  readonly actions: CheckoutActions;
  readonly messages: CheckoutPageMessages;
  readonly shippingAddressOptions?: readonly CheckoutShippingAddressOption[];
  readonly state: CheckoutState;
}) {
  let content: ReactNode = null;

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
      {content}
    </section>
  );
}

function CartSidebar({
  messages,
  state,
}: {
  readonly messages: CheckoutPageMessages;
  readonly state: CheckoutState;
}) {
  const locale = state.scope.locale;

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
        <span className="font-semibold text-sm">
          {formatMoney(state.cart.totalPrice, locale)}
        </span>
      </div>
    </aside>
  );
}

export async function CheckoutView({
  actions,
  locale,
  shippingAddressOptions,
  state,
}: {
  readonly actions: CheckoutActions;
  readonly locale: Locale;
  readonly shippingAddressOptions?: readonly CheckoutShippingAddressOption[];
  readonly state: CheckoutState;
}) {
  const t = await getTranslations({ locale, namespace: "web.checkout" });

  const checkoutLocale = CommerceLocale.make(locale);
  const messages: CheckoutPageMessages = {
    activeStep: t("activeStep"),
    attention: t("attention"),
    cartTitle: t("cart.title"),
    cartItems: (count) => t("cart.items", { count }),
    cartQuantity: (quantity) => t("cart.quantity", { quantity }),
    cartViolations: t("cart.violations"),
    subtotal: t("cart.subtotal"),
    stepLabels: {
      contact: t("steps.contact"),
      deliveryDetails: t("steps.deliveryDetails"),
      shippingOptions: t("steps.shippingOptions"),
      paymentOptions: t("steps.paymentOptions"),
      reviewOrder: t("steps.reviewOrder"),
    },
    stepStatuses: {
      complete: t("status.complete"),
      incomplete: t("status.incomplete"),
    },
    violation: (violation) =>
      checkoutViolationMessage(checkoutLocale, violation),
  };

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:grid-cols-5">
      <CheckoutSteps messages={messages} state={state} />
      <ActiveStep
        actions={actions}
        messages={messages}
        shippingAddressOptions={shippingAddressOptions}
        state={state}
      />
      <CartSidebar messages={messages} state={state} />
    </main>
  );
}
