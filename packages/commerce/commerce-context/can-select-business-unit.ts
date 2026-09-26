import { Effect } from "effect";

import type { CommerceBusinessUnitId } from "../domain/commerce-account";
import { CommerceAccounts } from "../services/commerce-accounts";
import { CommerceContext } from "../services/commerce-context";

export const canSelectBusinessUnit = Effect.fn(
  "BuyingContext.canSelectBusinessUnit"
)(function* (businessUnitId: CommerceBusinessUnitId) {
  const context = yield* CommerceContext;
  if (context.principal._tag !== "CustomerCommercePrincipal") {
    return false;
  }
  const accounts = yield* CommerceAccounts;
  const memberships =
    yield* accounts.listBusinessUnitMembershipsForCustomerInStore(
      context.principal.customerId,
      context.store.storeKey
    );
  return memberships.some(
    (membership) => membership.businessUnitId === businessUnitId
  );
});
