import { BusinessUnitSwitcher } from "@repo/commerce/commerce-context";
import { getLocale } from "@repo/i18n";

import { selectBusinessUnit } from "@/lib/commerce-context-actions";

export async function HeaderBusinessUnit() {
  const locale = await getLocale();
  return (
    <BusinessUnitSwitcher
      locale={locale}
      onSwitchBusinessUnit={selectBusinessUnit}
    />
  );
}
