import { createHash } from "node:crypto";

import type {
  CartValueTier,
  ShippingMethod,
  ShippingRate,
  ShippingRatePriceTier,
} from "@commercetools/platform-sdk";
import type { CartSnapshot } from "@repo/commerce/domain/cart-snapshot";
import type {
  DeliveryPlan,
  ShippingOption,
} from "@repo/commerce/domain/delivery-plan";
import { CurrencyCode, money } from "@repo/commerce/domain/money";
import {
  DeliveryPlanning,
  DeliveryPlanningProviderFailure,
  makeDeliveryPlanning,
} from "@repo/commerce/services/delivery-planning";
import type { QuoteDeliveryPlans } from "@repo/commerce/services/delivery-planning";
import { Effect, Layer } from "effect";

import { CommercetoolsRestClient } from "../client/rest-client";
import {
  commercetoolsProviderFailureReason,
  commercetoolsRequest,
} from "../client/versioned-write";
import {
  deliveryPlanReferenceFor,
  deliveryPlanQuoteReferenceFor,
  LINEAR_DELIVERY_GROUP_REFERENCE,
  shippingOptionReferenceFor,
} from "./references";

const providerContractDefect = (message: string) => new Error(message);

const isCartValueTier = (tier: ShippingRatePriceTier): tier is CartValueTier =>
  tier.type === "CartValue";

const matchingRateFor = (method: ShippingMethod): ShippingRate => {
  const rates = method.zoneRates.flatMap((zoneRate) =>
    zoneRate.shippingRates.filter((rate) => rate.isMatching)
  );
  const [rate] = rates;

  if (rate === undefined || rates.length !== 1) {
    throw providerContractDefect(
      `Commercetools Shipping Method ${method.id} did not contain exactly one matching Shipping Rate`
    );
  }

  return rate;
};

const cartValueForShippingRate = (cart: CartSnapshot): number => {
  let centAmount = 0;

  for (const lineItem of cart.lineItems) {
    const lineItemPrice = lineItem.totalPrice ?? {
      centAmount: lineItem.unitPrice.centAmount * lineItem.quantity,
      currencyCode: lineItem.unitPrice.currencyCode,
    };
    if (lineItemPrice.currencyCode !== cart.totalPrice.currencyCode) {
      throw providerContractDefect(
        `Cart Line Item ${lineItem.id} currency ${lineItemPrice.currencyCode} does not match Cart currency ${cart.totalPrice.currencyCode}`
      );
    }
    centAmount += lineItemPrice.centAmount;
  }

  if (!Number.isSafeInteger(centAmount)) {
    throw providerContractDefect(
      "Cart Line Item total is not a safe integer cent amount"
    );
  }

  return centAmount;
};

const effectiveRatePrice = (
  cart: CartSnapshot,
  rate: ShippingRate
): ShippingOption["price"] => {
  if (rate.price.currencyCode !== cart.totalPrice.currencyCode) {
    throw providerContractDefect(
      `Commercetools returned Shipping Rate currency ${rate.price.currencyCode} for Cart currency ${cart.totalPrice.currencyCode}`
    );
  }
  const cartValue = cartValueForShippingRate(cart);

  if (
    rate.freeAbove?.currencyCode === cart.totalPrice.currencyCode &&
    cartValue >= rate.freeAbove.centAmount
  ) {
    return money(0, CurrencyCode.make(rate.price.currencyCode));
  }

  const unsupportedTier = rate.tiers.find((tier) => tier.type !== "CartValue");
  if (unsupportedTier !== undefined) {
    throw providerContractDefect(
      `Commercetools Shipping Rate tier ${unsupportedTier.type} requires a Shipping Rate input that Delivery Planning does not provide`
    );
  }

  let tier: CartValueTier | undefined;
  for (const candidate of rate.tiers) {
    if (
      isCartValueTier(candidate) &&
      candidate.minimumCentAmount <= cartValue &&
      (tier === undefined ||
        candidate.minimumCentAmount > tier.minimumCentAmount)
    ) {
      tier = candidate;
    }
  }
  const price = tier?.price ?? rate.price;
  const { centAmount } = price;
  if (centAmount === undefined || !Number.isSafeInteger(centAmount)) {
    throw providerContractDefect(
      "Commercetools returned a Shipping Rate without a valid cent amount"
    );
  }

  return money(centAmount, CurrencyCode.make(price.currencyCode));
};

const localizedValue = (
  values: Readonly<Record<string, string>> | undefined,
  locale: string
) => values?.[locale];

const orderedBy = <Value>(
  values: readonly Value[],
  key: (value: Value) => string
): readonly Value[] => {
  const ordered: Value[] = [];
  for (const value of values) {
    const insertionIndex = ordered.findIndex(
      (candidate) => key(value).localeCompare(key(candidate)) < 0
    );
    if (insertionIndex === -1) {
      ordered.push(value);
    } else {
      ordered.splice(insertionIndex, 0, value);
    }
  }
  return ordered;
};

const quoteReferenceFor = (
  cart: CartSnapshot,
  plans: readonly DeliveryPlan[]
) =>
  deliveryPlanQuoteReferenceFor(
    createHash("sha256")
      .update(
        JSON.stringify({
          cart: {
            currencyCode: cart.totalPrice.currencyCode,
            id: cart.id,
            lineItems: orderedBy(cart.lineItems, (lineItem) => lineItem.id).map(
              (lineItem) => ({
                id: lineItem.id,
                quantity: lineItem.quantity,
              })
            ),
          },
          plans: orderedBy(plans, (plan) => plan.reference).map((plan) => ({
            groups: orderedBy(plan.groups, (group) => group.reference).map(
              (group) => ({
                reference: group.reference,
                shippingAddress: {
                  addressLine1: group.shippingAddress.addressLine1,
                  addressLine2: group.shippingAddress.addressLine2,
                  city: group.shippingAddress.city,
                  country: group.shippingAddress.country,
                  postalCode: group.shippingAddress.postalCode,
                  region: group.shippingAddress.region,
                },
                shippingOptions: orderedBy(
                  group.shippingOptions,
                  (option) => option.reference
                ).map((option) => ({
                  deliveryPromise: option.deliveryPromise?.label,
                  description: option.description,
                  name: option.name,
                  price: {
                    centAmount: option.price.centAmount,
                    currencyCode: option.price.currencyCode,
                  },
                  reference: option.reference,
                })),
                targets: orderedBy(
                  group.targets,
                  (target) => target.lineItemId
                ).map((target) => ({
                  lineItemId: target.lineItemId,
                  quantity: target.quantity,
                })),
              })
            ),
            reference: plan.reference,
          })),
        })
      )
      .digest("base64url")
  );

const shippingOptionFor = (
  input: QuoteDeliveryPlans,
  method: ShippingMethod
): ShippingOption => {
  const rate = matchingRateFor(method);
  const description = localizedValue(method.localizedDescription, input.locale);

  const option = {
    name: localizedValue(method.localizedName, input.locale) ?? method.name,
    price: effectiveRatePrice(input.cart, rate),
    reference: shippingOptionReferenceFor(method.id),
  };
  return description === undefined || description.length === 0
    ? option
    : { ...option, description };
};

export const deliveryPlanningLayer = Layer.effect(
  DeliveryPlanning,
  Effect.gen(function* () {
    const { apiRoot } = yield* CommercetoolsRestClient;

    return makeDeliveryPlanning(
      Effect.fn("CommercetoolsDeliveryPlanning.quote")(function* (input) {
        const { cart } = input;
        const { deliveryDetails } = cart.checkoutDetails;
        if (deliveryDetails === undefined || cart.lineItems.length === 0) {
          return { plans: [], reference: quoteReferenceFor(cart, []) };
        }
        const [firstLineItem, ...remainingLineItems] = cart.lineItems;
        if (firstLineItem === undefined) {
          return { plans: [], reference: quoteReferenceFor(cart, []) };
        }
        const baseQuery = {
          cartId: cart.id,
          country: deliveryDetails.shippingAddress.country,
          currency: cart.totalPrice.currencyCode,
        };
        const queryArgs =
          deliveryDetails.shippingAddress.region === undefined
            ? baseQuery
            : {
                ...baseQuery,
                state: deliveryDetails.shippingAddress.region,
              };

        const response = yield* commercetoolsRequest(
          "Failed to get matching Commercetools Shipping Methods",
          async () =>
            await apiRoot
              .shippingMethods()
              .matchingCartLocation()
              .get({
                queryArgs,
              })
              .execute()
        ).pipe(
          Effect.mapError(
            (cause) =>
              new DeliveryPlanningProviderFailure({
                cause,
                operation: "quote",
                reason: commercetoolsProviderFailureReason(cause),
              })
          )
        );

        const plans: DeliveryPlan[] = [
          {
            groups: [
              {
                reference: LINEAR_DELIVERY_GROUP_REFERENCE,
                shippingAddress: deliveryDetails.shippingAddress,
                shippingOptions: response.body.results.map((method) =>
                  shippingOptionFor(input, method)
                ),
                targets: [
                  {
                    lineItemId: firstLineItem.id,
                    quantity: firstLineItem.quantity,
                  },
                  ...remainingLineItems.map((lineItem) => ({
                    lineItemId: lineItem.id,
                    quantity: lineItem.quantity,
                  })),
                ],
              },
            ],
            reference: deliveryPlanReferenceFor(cart.id),
          },
        ];

        return { plans, reference: quoteReferenceFor(cart, plans) };
      })
    );
  })
);
