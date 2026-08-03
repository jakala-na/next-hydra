import "server-only";

import { withAuth } from "@repo/auth-workos/server";
import { StoreKey } from "@repo/commerce/domain/cart";
import { AuthUserId } from "@repo/commerce/domain/commerce-request-context";
import { storeService } from "@repo/commerce/lib/store/store.service";
import { CommerceAccounts } from "@repo/commerce/services/commerce-accounts";
import { BusinessUnitSwitcher as BusinessUnitSwitcherView } from "@repo/design-system/components/layout/business-unit-switcher";
import type { Locale } from "@repo/i18n/types";
import { Effect, Schema } from "effect";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import {
  BUSINESS_UNIT_COOKIE_NAME,
  getBusinessUnitIdFromCookieValue,
} from "@/lib/business-unit-cookie";
import { commerceAccountsLayer } from "@/lib/commerce-layers";
import { selectBusinessUnit } from "./business-unit-actions";

interface BusinessUnitSwitcherProps {
  readonly locale: Locale;
}

export async function BusinessUnitSwitcher({
  locale,
}: BusinessUnitSwitcherProps) {
  let request:
    | {
        readonly authUserId: string;
        readonly selectedBusinessUnitId: ReturnType<
          typeof getBusinessUnitIdFromCookieValue
        >;
      }
    | undefined;

  try {
    const [session, cookieStore] = await Promise.all([withAuth(), cookies()]);
    if (!session.user) {
      return null;
    }
    request = {
      authUserId: session.user.id,
      selectedBusinessUnitId: getBusinessUnitIdFromCookieValue(
        cookieStore.get(BUSINESS_UNIT_COOKIE_NAME)?.value
      ),
    };
  } catch (error) {
    unstable_rethrow(error);
    await Effect.runPromise(
      Effect.logError("Failed to read Business Unit request", error)
    );
    return null;
  }

  const result = await Effect.runPromise(
    Effect.gen(function* () {
      const store = yield* Effect.tryPromise(() =>
        storeService.getStoreContextByLocale(locale)
      );
      const authUserId = yield* Schema.decodeUnknownEffect(AuthUserId)(
        request.authUserId
      );
      const accounts = yield* CommerceAccounts;
      const customerId = yield* accounts.getCustomerIdByAuthUserId(authUserId);
      const loadedMemberships =
        yield* accounts.listBusinessUnitMembershipsForCustomerInStore(
          customerId,
          StoreKey.make(store.storeKey)
        );
      return {
        memberships: loadedMemberships,
        selectedBusinessUnitId: request.selectedBusinessUnitId,
      };
    }).pipe(
      Effect.provide(commerceAccountsLayer),
      Effect.catch((error) =>
        Effect.logError("Failed to load Business Unit switcher", error).pipe(
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
