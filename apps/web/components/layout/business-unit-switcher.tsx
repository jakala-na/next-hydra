import "server-only";

import { withAuth } from "@repo/auth-workos/server";
import { StoreKey } from "@repo/commerce/domain/cart";
import { AuthUserId } from "@repo/commerce/domain/commerce-request-context";
import { layerCommercetoolsCommerceAccounts } from "@repo/commerce/lib/infra/commercetools/commerce-accounts";
import { storeService } from "@repo/commerce/lib/store/store.service";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import { BusinessUnitSwitcher as BusinessUnitSwitcherView } from "@repo/design-system/components/layout/business-unit-switcher";
import type { Locale } from "@repo/i18n/types";
import { Effect, Schema } from "effect";
import { cookies } from "next/headers";
import {
  BUSINESS_UNIT_COOKIE_NAME,
  getBusinessUnitIdFromCookieValue,
} from "@/lib/business-unit-cookie";
import { selectBusinessUnit } from "./business-unit-actions";

interface BusinessUnitSwitcherProps {
  readonly locale: Locale;
}

export async function BusinessUnitSwitcher({
  locale,
}: BusinessUnitSwitcherProps) {
  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const session = yield* Effect.promise(() => withAuth());
      if (!session.user) {
        return null;
      }

      const store = yield* Effect.promise(() =>
        storeService.getStoreContextByLocale(locale)
      );
      const authUserId = yield* Schema.decodeUnknownEffect(AuthUserId)(
        session.user.id
      );
      const accounts = yield* CommerceAccounts;
      const customerId = yield* accounts.getCustomerIdByAuthUserId(authUserId);
      const loadedMemberships =
        yield* accounts.listBusinessUnitMembershipsForCustomerInStore(
          customerId,
          StoreKey.make(store.storeKey)
        );
      const cookieStore = yield* Effect.promise(() => cookies());
      const selectedCookieBusinessUnitId = getBusinessUnitIdFromCookieValue(
        cookieStore.get(BUSINESS_UNIT_COOKIE_NAME)?.value
      );

      return {
        memberships: loadedMemberships,
        selectedBusinessUnitId: selectedCookieBusinessUnitId,
      };
    }).pipe(
      Effect.provide(layerCommercetoolsCommerceAccounts),
      Effect.catchCause((cause) =>
        Effect.logError("Failed to load Business Unit switcher", cause).pipe(
          Effect.as(null)
        )
      )
    )
  );

  if (result === null) {
    return null;
  }

  const { memberships, selectedBusinessUnitId } = result;
  const selectedMembership = memberships.find(
    ({ businessUnitId }) => businessUnitId === selectedBusinessUnitId
  );
  let currentBusinessUnitId = selectedMembership?.businessUnitId;
  if (selectedBusinessUnitId === undefined && memberships.length === 1) {
    currentBusinessUnitId = memberships[0]?.businessUnitId;
  }

  return (
    <BusinessUnitSwitcherView
      currentBusinessUnitId={currentBusinessUnitId}
      items={memberships.map(({ businessUnitId, businessUnitLabel }) => ({
        id: businessUnitId,
        label: businessUnitLabel,
      }))}
      onSwitchBusinessUnit={selectBusinessUnit}
    />
  );
}
