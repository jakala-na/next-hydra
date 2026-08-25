import "server-only";
/* oxlint-disable typescript/no-unsafe-assignment -- Effect's branded values remain schema-checked; the lint analyzer loses their generic types across NextCommerce.runPromise and JSX. */
import { NextCommerce } from "@repo/commerce/runtime";
import { CustomerArea } from "@repo/design-system/components/layout/customer-area";
import { getTranslations } from "@repo/i18n";
import type { Locale } from "@repo/i18n/types";
import { Effect } from "effect";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import { inviteCompanyMember } from "./actions";
import { CompanyMemberInvitationForm } from "./company-member-invitation-form";
import { getCustomerAccountOverview } from "./programs";

export interface CustomerAccountPageProps {
  readonly locale: Locale;
}

export const CustomerAccountPage = async ({
  locale,
}: CustomerAccountPageProps) => {
  await connection();

  const account = await NextCommerce.runPromise(
    getCustomerAccountOverview().pipe(
      NextCommerce.provide(locale),
      Effect.catchTags({
        CommerceRequestContextNotFound: () => Effect.succeed(null),
      })
    )
  );

  if (account === null) {
    notFound();
  }

  const t = await getTranslations({ locale, namespace: "web.customerArea" });
  const accountHref = `/${locale}/account`;

  return (
    <CustomerArea
      companyLabel={account.companyLabel}
      description={t("description")}
      navigation={[
        {
          current: true,
          href: accountHref,
          label: t("navigation.accountManagement"),
        },
        {
          label: t("navigation.orders"),
          statusLabel: t("navigation.comingSoon"),
        },
        {
          label: t("navigation.addresses"),
          statusLabel: t("navigation.comingSoon"),
        },
      ]}
      title={t("title")}
    >
      <CompanyMemberInvitationForm
        canInvite={account.canInvite}
        inviteAction={inviteCompanyMember}
      />
    </CustomerArea>
  );
};
