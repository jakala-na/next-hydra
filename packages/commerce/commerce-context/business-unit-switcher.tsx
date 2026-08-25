import "server-only";
import { NextCommerce } from "@repo/commerce/runtime";
import { BusinessUnitSwitcher as BusinessUnitSwitcherView } from "@repo/design-system/components/layout/business-unit-switcher";
import type { Locale } from "@repo/i18n/types";
import { Effect } from "effect";
import { unstable_rethrow } from "next/navigation";
import { connection } from "next/server";

import { CommerceAccounts } from "../services/commerce-accounts";
import { CommerceContext } from "../services/commerce-context";

interface BusinessUnitSwitcherProps {
  readonly locale: Locale;
  readonly onSwitchBusinessUnit: (businessUnitId: string) => Promise<void>;
}

type BusinessUnitSwitcherData = {
  readonly currentBusinessUnitId: string;
  readonly items: readonly {
    readonly id: string;
    readonly label: string;
  }[];
};

async function loadBusinessUnitSwitcherData(
  locale: Locale
): Promise<BusinessUnitSwitcherData | null> {
  try {
    const result = await NextCommerce.runPromise(
      Effect.gen(function* () {
        const context = yield* CommerceContext;
        if (context.principal._tag !== "CustomerCommercePrincipal") {
          return null;
        }

        const accounts = yield* CommerceAccounts;
        const memberships =
          yield* accounts.listBusinessUnitMembershipsForCustomerInStore(
            context.principal.customerId,
            context.store.storeKey
          );

        return {
          currentBusinessUnitId: context.principal.businessUnitId,
          items: memberships.map(({ businessUnitId, businessUnitLabel }) => ({
            id: businessUnitId,
            label: businessUnitLabel,
          })),
        };
      }).pipe(
        NextCommerce.provide(locale),
        Effect.tapError((error) =>
          Effect.logError("Failed to load Business Unit switcher", error).pipe(
            Effect.annotateLogs({ operation: "buyingContext.switcher.load" })
          )
        ),
        Effect.result
      )
    );

    if (result._tag === "Failure" || result.success === null) {
      return null;
    }

    return result.success;
  } catch (error) {
    unstable_rethrow(error);
    await Effect.runPromise(
      Effect.logError("Failed to load Business Unit switcher", error).pipe(
        Effect.annotateLogs({ operation: "buyingContext.switcher.load" })
      )
    );
    return null;
  }
}

export async function BusinessUnitSwitcher({
  locale,
  onSwitchBusinessUnit,
}: BusinessUnitSwitcherProps) {
  await connection();

  const switcherData = await loadBusinessUnitSwitcherData(locale);

  if (switcherData === null) {
    return null;
  }

  return (
    <BusinessUnitSwitcherView
      currentBusinessUnitId={switcherData.currentBusinessUnitId}
      items={switcherData.items}
      onSwitchBusinessUnit={(businessUnitId) => {
        void onSwitchBusinessUnit(businessUnitId);
      }}
    />
  );
}
