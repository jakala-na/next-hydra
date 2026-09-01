"use client";

import { useTranslations } from "@repo/i18n";
import { useActionState, useMemo, useState } from "react";

import type { CartSnapshot } from "../domain/cart-snapshot";
import type {
  DeliveryGroupReference,
  DeliveryPlan,
  DeliveryPlanQuote,
  SelectedDeliveryPlan,
  ShippingOptionReference,
} from "../domain/delivery-plan";
import type { SaveCheckoutShippingOptionsAction } from "./action-contract";

const CENTS_PER_MAJOR_CURRENCY_UNIT = 100;

type ShippingOptionSelections = ReadonlyMap<
  DeliveryGroupReference,
  ShippingOptionReference | undefined
>;

function formatMoney(
  money: DeliveryPlan["groups"][number]["shippingOptions"][number]["price"],
  locale: string
): string {
  return new Intl.NumberFormat(locale, {
    currency: money.currencyCode,
    style: "currency",
  }).format(money.centAmount / CENTS_PER_MAJOR_CURRENCY_UNIT);
}

function initialSelectionsFor(
  plan: DeliveryPlan,
  selectedPlan: SelectedDeliveryPlan | undefined
): ShippingOptionSelections {
  const selections = new Map<
    DeliveryGroupReference,
    ShippingOptionReference | undefined
  >();
  for (const group of plan.groups) {
    const persisted =
      selectedPlan?.reference === plan.reference
        ? selectedPlan.groups.find(
            (candidate) => candidate.reference === group.reference
          )?.selectedShippingOption.reference
        : undefined;
    selections.set(group.reference, persisted);
  }
  return selections;
}

interface CheckoutShippingOptionsFormProps {
  readonly cart: CartSnapshot;
  readonly deliveryPlanQuote: DeliveryPlanQuote;
  readonly locale: string;
  readonly saveAction: SaveCheckoutShippingOptionsAction;
  readonly selectedPlan?: SelectedDeliveryPlan;
}

function ShippingOptionsFormForQuote({
  cart,
  deliveryPlanQuote,
  locale,
  saveAction,
  selectedPlan,
}: CheckoutShippingOptionsFormProps) {
  const t = useTranslations("web.checkout.shippingOptions");
  const [firstPlan] = deliveryPlanQuote.plans;
  const initiallySelectedPlan =
    deliveryPlanQuote.plans.find(
      (plan) => plan.reference === selectedPlan?.reference
    ) ?? firstPlan;
  const [activePlanReference, setActivePlanReference] = useState(
    initiallySelectedPlan?.reference
  );
  const activePlan = deliveryPlanQuote.plans.find(
    (plan) => plan.reference === activePlanReference
  );
  const [selections, setSelections] = useState<ShippingOptionSelections>(
    initiallySelectedPlan === undefined
      ? new Map()
      : initialSelectionsFor(initiallySelectedPlan, selectedPlan)
  );
  const [actionResult, formAction, isPending] = useActionState(
    saveAction,
    null
  );
  const failure =
    actionResult?._tag === "Failure" ? actionResult.failure : undefined;
  const lineItems = useMemo(
    () => new Map(cart.lineItems.map((lineItem) => [lineItem.id, lineItem])),
    [cart.lineItems]
  );
  const selection =
    activePlan === undefined
      ? undefined
      : {
          groups: activePlan.groups.flatMap((group) => {
            const shippingOptionReference = selections.get(group.reference);
            const isCurrentOption = group.shippingOptions.some(
              (option) => option.reference === shippingOptionReference
            );
            return shippingOptionReference === undefined || !isCurrentOption
              ? []
              : [
                  {
                    deliveryGroupReference: group.reference,
                    shippingOptionReference,
                  },
                ];
          }),
          quoteReference: deliveryPlanQuote.reference,
          reference: activePlan.reference,
        };
  const canSave =
    activePlan !== undefined &&
    selection !== undefined &&
    selection.groups.length === activePlan.groups.length;

  if (firstPlan === undefined) {
    return (
      <p className="rounded-md border border-border bg-muted/40 p-4 text-muted-foreground text-sm">
        {t("noPlans")}
      </p>
    );
  }

  return (
    <form action={formAction} className="grid gap-6">
      <input name="cartId" type="hidden" value={cart.id} />
      <input
        name="selection"
        type="hidden"
        value={selection === undefined ? "" : JSON.stringify(selection)}
      />
      {failure === undefined ? null : (
        <p
          aria-live="polite"
          className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-destructive text-sm"
          role="alert"
        >
          {failure.displayMessage}
        </p>
      )}
      {deliveryPlanQuote.plans.length <= 1 ? null : (
        <fieldset className="grid gap-2">
          <legend className="font-medium text-sm">{t("choosePlan")}</legend>
          {deliveryPlanQuote.plans.map((plan, index) => (
            <label className="flex items-center gap-3" key={plan.reference}>
              <input
                checked={plan.reference === activePlanReference}
                name="deliveryPlan"
                onChange={() => {
                  setActivePlanReference(plan.reference);
                  setSelections(initialSelectionsFor(plan, selectedPlan));
                }}
                type="radio"
              />
              <span>{t("plan", { number: index + 1 })}</span>
            </label>
          ))}
        </fieldset>
      )}
      {activePlan?.groups.map((group, groupIndex) => (
        <section
          className="grid gap-4 rounded-md border border-border p-4"
          data-delivery-group={group.reference}
          key={group.reference}
        >
          <div>
            <h2 className="font-semibold">
              {t("delivery", { number: groupIndex + 1 })}
            </h2>
            <ul className="mt-2 grid gap-1 text-muted-foreground text-sm">
              {group.targets.map((target) => {
                const lineItem = lineItems.get(target.lineItemId);
                return (
                  <li
                    data-delivery-target-line-item-id={target.lineItemId}
                    data-delivery-target-quantity={target.quantity}
                    key={target.lineItemId}
                  >
                    {lineItem?.variant.name ?? target.lineItemId} ·{" "}
                    {t("quantity", {
                      quantity: target.quantity,
                    })}
                  </li>
                );
              })}
            </ul>
          </div>
          {group.shippingOptions.length === 0 ? (
            <p className="text-muted-foreground text-sm">{t("noOptions")}</p>
          ) : (
            <fieldset className="grid gap-2">
              <legend className="sr-only">{t("chooseOption")}</legend>
              {group.shippingOptions.map((option) => (
                <label
                  className="grid cursor-pointer grid-cols-[auto_1fr_auto] items-start gap-3 rounded-md border border-border p-3 has-[:checked]:border-primary has-[:checked]:bg-primary/5"
                  data-shipping-option={option.reference}
                  data-shipping-option-name={option.name}
                  key={option.reference}
                >
                  <input
                    checked={
                      selections.get(group.reference) === option.reference
                    }
                    name={`shipping-option-${group.reference}`}
                    onChange={() => {
                      setSelections((current) =>
                        new Map(current).set(group.reference, option.reference)
                      );
                    }}
                    type="radio"
                  />
                  <span>
                    <span className="block font-medium text-sm">
                      {option.name}
                    </span>
                    {option.description === undefined ? null : (
                      <span className="block text-muted-foreground text-xs">
                        {option.description}
                      </span>
                    )}
                    {option.deliveryPromise === undefined ? null : (
                      <span className="block text-muted-foreground text-xs">
                        {option.deliveryPromise.label}
                      </span>
                    )}
                  </span>
                  <span
                    className="font-medium text-sm"
                    data-commerce-money="shipping-option"
                    data-currency={option.price.currencyCode}
                    data-minor-amount={option.price.centAmount}
                  >
                    {formatMoney(option.price, locale)}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </section>
      ))}
      <div>
        <button
          className="h-10 rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm disabled:cursor-not-allowed disabled:opacity-60"
          disabled={!canSave || isPending}
          type="submit"
        >
          {isPending ? t("actions.saving") : t("actions.save")}
        </button>
      </div>
    </form>
  );
}

export function CheckoutShippingOptionsForm(
  props: CheckoutShippingOptionsFormProps
) {
  return (
    <ShippingOptionsFormForQuote
      {...props}
      key={props.deliveryPlanQuote.reference}
    />
  );
}
