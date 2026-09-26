import type {
  DeliveryPlanQuote,
  DeliveryTarget,
  SelectedDeliveryPlan,
} from "../../domain/delivery-plan";
import type { Money } from "../../domain/money";
import { shippingAddressesEqual } from "./address-equality";

const moneyEqual = (left: Money, right: Money) =>
  left.centAmount === right.centAmount &&
  left.currencyCode === right.currencyCode;

const targetsEqual = (
  left: readonly DeliveryTarget[],
  right: readonly DeliveryTarget[]
) =>
  left.length === right.length &&
  left.every((target) =>
    right.some(
      (candidate) =>
        candidate.lineItemId === target.lineItemId &&
        candidate.quantity === target.quantity
    )
  );

export const selectedDeliveryPlansEqual = (
  left: SelectedDeliveryPlan | undefined,
  right: SelectedDeliveryPlan
) => {
  if (
    left === undefined ||
    left.reference !== right.reference ||
    left.quoteReference !== right.quoteReference ||
    left.groups.length !== right.groups.length
  ) {
    return false;
  }

  return left.groups.every((group) => {
    const candidate = right.groups.find(
      (rightGroup) => rightGroup.reference === group.reference
    );
    return (
      candidate !== undefined &&
      shippingAddressesEqual(
        group.shippingAddress,
        candidate.shippingAddress
      ) &&
      targetsEqual(group.targets, candidate.targets) &&
      group.selectedShippingOption.reference ===
        candidate.selectedShippingOption.reference &&
      moneyEqual(
        group.selectedShippingOption.price,
        candidate.selectedShippingOption.price
      )
    );
  });
};

export const selectedPlanMatchesQuote = (
  selectedPlan: SelectedDeliveryPlan | undefined,
  quote: DeliveryPlanQuote
) => {
  if (
    selectedPlan === undefined ||
    selectedPlan.quoteReference !== quote.reference
  ) {
    return false;
  }

  const offeredPlan = quote.plans.find(
    (plan) => plan.reference === selectedPlan.reference
  );
  if (
    offeredPlan === undefined ||
    offeredPlan.groups.length !== selectedPlan.groups.length
  ) {
    return false;
  }

  return offeredPlan.groups.every((offeredGroup) => {
    const selectedGroup = selectedPlan.groups.find(
      (group) => group.reference === offeredGroup.reference
    );
    if (
      selectedGroup === undefined ||
      !shippingAddressesEqual(
        selectedGroup.shippingAddress,
        offeredGroup.shippingAddress
      ) ||
      !targetsEqual(selectedGroup.targets, offeredGroup.targets)
    ) {
      return false;
    }

    const offeredOption = offeredGroup.shippingOptions.find(
      (option) =>
        option.reference === selectedGroup.selectedShippingOption.reference
    );
    return (
      offeredOption !== undefined &&
      moneyEqual(
        offeredOption.price,
        selectedGroup.selectedShippingOption.price
      )
    );
  });
};
