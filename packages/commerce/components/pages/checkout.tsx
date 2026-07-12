import type { Locale } from "@repo/i18n/types";
import { Effect } from "effect";
import { notFound } from "next/navigation";
import { CartId } from "../../domain/cart";
import {
  CheckoutLocale,
  type CheckoutState,
  type CheckoutStepId,
} from "../../domain/checkout";
import {
  AnonymousCommercePrincipal,
  CommerceRequestContext,
} from "../../domain/commerce-request-context";
import { getAnonymousCartId } from "../../lib/cart/utils/anonymous-cart-cookies";
import { CheckoutSession } from "../../lib/checkout/checkout-session";
import { checkoutRuntimeLayerCommercetools } from "../../lib/checkout/commercetools";
import { toCheckoutScope } from "../../lib/checkout/request-context";
import { storeService } from "../../lib/store/store.service";
import { CheckoutContactForm } from "./checkout-contact-form";
import { CheckoutDeliveryDetailsForm } from "./checkout-delivery-details-form";

const CENTS_PER_MAJOR_CURRENCY_UNIT = 100;

const stepLabels: Record<CheckoutStepId, string> = {
  contact: "Contact",
  deliveryDetails: "Delivery details",
  shippingOptions: "Shipping options",
  paymentOptions: "Payment options",
  reviewOrder: "Review order",
};

const formatMoney = (
  money: CheckoutState["cart"]["totalPrice"],
  locale: string
) =>
  new Intl.NumberFormat(locale, {
    style: "currency",
    currency: money.currencyCode,
  }).format(money.centAmount / CENTS_PER_MAJOR_CURRENCY_UNIT);

const getState = async (locale: Locale) => {
  const storeContext = await storeService.getStoreContextByLocale(locale);
  const anonymousCartId = await getAnonymousCartId(storeContext);

  if (anonymousCartId === null || anonymousCartId.length === 0) {
    return null;
  }

  const context = new CommerceRequestContext({
    locale: CheckoutLocale.make(locale),
    principal: new AnonymousCommercePrincipal({
      anonymousCartId: CartId.make(anonymousCartId),
    }),
  });
  const scope = toCheckoutScope(context);

  return Effect.runPromise(
    CheckoutSession.getCurrent(scope).pipe(
      Effect.catchTag("CheckoutUnavailable", () => Effect.succeed(null)),
      Effect.provide(checkoutRuntimeLayerCommercetools)
    )
  );
};

function CheckoutSteps({ state }: { readonly state: CheckoutState }) {
  return (
    <ol className="grid gap-3">
      {state.steps.map((step) => (
        <li
          className="flex items-center justify-between border-border border-b py-3 last:border-b-0"
          key={step.id}
        >
          <span className="font-medium text-sm">{stepLabels[step.id]}</span>
          <span className="text-muted-foreground text-sm capitalize">
            {step.status}
          </span>
        </li>
      ))}
    </ol>
  );
}

function ActiveStep({ state }: { readonly state: CheckoutState }) {
  let content = <CheckoutSteps state={state} />;

  if (state.activeStep === "contact") {
    content = (
      <CheckoutContactForm
        buyerContact={state.details.contact?.buyerContact}
        cartId={state.cart.id}
        cartVersion={state.cart.version}
      />
    );
  } else if (state.activeStep === "deliveryDetails") {
    content = (
      <CheckoutDeliveryDetailsForm
        cartId={state.cart.id}
        cartVersion={state.cart.version}
        shippingAddress={state.details.deliveryDetails?.shippingAddress}
      />
    );
  }

  return (
    <section className="min-h-80 rounded-md border border-border p-6 sm:col-span-3">
      <div className="mb-6 border-border border-b pb-4">
        <p className="text-muted-foreground text-sm">Active step</p>
        <h1 className="font-semibold text-2xl">
          {stepLabels[state.activeStep]}
        </h1>
      </div>
      {content}
    </section>
  );
}

function CartSidebar({ state }: { readonly state: CheckoutState }) {
  const locale = state.scope.locale;

  return (
    <aside className="rounded-md border border-border p-6 sm:col-span-2">
      <div className="mb-5 flex items-center justify-between gap-4">
        <h2 className="font-semibold text-lg">Cart</h2>
        <span className="text-muted-foreground text-sm">
          {state.cart.totalLineItemQuantity} items
        </span>
      </div>
      <ul className="grid gap-4">
        {state.cart.lineItems.map((lineItem) => (
          <li className="border-border border-b pb-4" key={lineItem.id}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="font-medium text-sm">
                  {lineItem.name ?? lineItem.productId}
                </p>
                <p className="text-muted-foreground text-sm">
                  Qty {lineItem.quantity}
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
      {state.violations.length > 0 ? (
        <div className="mt-5 border-destructive border-t pt-4">
          <h3 className="font-medium text-destructive text-sm">
            Checkout violations
          </h3>
          <ul className="mt-3 grid gap-2">
            {state.violations.map((violation) => (
              <li className="text-destructive text-sm" key={violation.code}>
                {violation.message}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <div className="mt-5 flex items-center justify-between border-border border-t pt-4">
        <span className="font-medium text-sm">Subtotal</span>
        <span className="font-semibold text-sm">
          {formatMoney(state.cart.totalPrice, locale)}
        </span>
      </div>
    </aside>
  );
}

export async function CheckoutPage({ locale }: { readonly locale: Locale }) {
  const state = await getState(locale);

  if (!state) {
    notFound();
  }

  return (
    <main className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-8 sm:grid-cols-5">
      <ActiveStep state={state} />
      <CartSidebar state={state} />
    </main>
  );
}
