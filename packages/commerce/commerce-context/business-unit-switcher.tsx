import "server-only";

import { BusinessUnitSwitcher as BusinessUnitSwitcherView } from "@repo/design-system/components/layout/business-unit-switcher";
import type { Locale } from "@repo/i18n/types";
import { Effect } from "effect";
import { unstable_rethrow } from "next/navigation";
import { CommerceAccounts } from "../services/commerce-accounts";
import { CommerceContext } from "../services/commerce-context";
import { selectBusinessUnit } from "./actions";
import { commerceRequestLayer } from "./request";

interface BusinessUnitSwitcherProps {
  readonly locale: Locale;
}

export async function BusinessUnitSwitcher({
  locale,
}: BusinessUnitSwitcherProps) {
  try {
    const layer = await commerceRequestLayer(locale);
    const result = await Effect.runPromise(
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
        Effect.provide(layer),
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

    return (
      <BusinessUnitSwitcherView
        currentBusinessUnitId={result.success.currentBusinessUnitId}
        items={result.success.items}
        onSwitchBusinessUnit={selectBusinessUnit}
      />
    );
  } catch (cause) {
    unstable_rethrow(cause);
    await Effect.runPromise(
      Effect.logError("Failed to load Business Unit switcher", cause).pipe(
        Effect.annotateLogs({ operation: "buyingContext.switcher.load" })
      )
    );
    return null;
  }
}
