import "server-only";
/* oxlint-disable typescript/no-unsafe-assignment -- Effect's branded values remain schema-checked; the lint analyzer loses their generic types across NextCommerce.runPromise and JSX. */
import { NextCommerce } from "@repo/commerce/runtime";
import type {
  CustomerAccountInvitationListItem,
  CustomerAccountMemberListItem,
} from "@repo/commerce/services/customer-account-members";
import { CustomerArea } from "@repo/design-system/components/layout/customer-area";
import { getTranslations } from "@repo/i18n";
import type { Locale } from "@repo/i18n/types";
import { Effect, Redacted } from "effect";
import { notFound } from "next/navigation";
import { connection } from "next/server";

import {
  cancelCompanyMemberInvitation,
  inviteCompanyMember,
  reissueCompanyMemberInvitation,
  removeCompanyMember,
} from "./actions";
import { CompanyMemberInvitationForm } from "./company-member-invitation-form";
import { CompanyMembersManagement } from "./company-members-management";
import type {
  CompanyInvitationRow,
  CompanyMemberRow,
} from "./company-members-management";
import { getCustomerAccountOverview } from "./programs";

export interface CustomerAccountPageProps {
  readonly locale: Locale;
}

const invitationRow = (
  invitation: CustomerAccountInvitationListItem,
  dateFormatter: Intl.DateTimeFormat
): CompanyInvitationRow => ({
  companyMemberInvitationId: invitation.companyMemberInvitationId,
  email: Redacted.value(invitation.inviteeEmail),
  expiresAtLabel: dateFormatter.format(invitation.expiresAt),
  firstName: Redacted.value(invitation.firstName),
  lastName: Redacted.value(invitation.lastName),
  roles: invitation.roles,
  status: invitation.status,
});

const memberRow = (member: CustomerAccountMemberListItem): CompanyMemberRow => {
  const row = {
    authUserId: member.authUserId,
    canRemove: member.canRemove,
    customerId: member.customerId,
    email: Redacted.value(member.email),
    roles: member.roles,
  } satisfies Omit<CompanyMemberRow, "firstName" | "lastName">;
  if (member.firstName !== undefined && member.lastName !== undefined) {
    return {
      ...row,
      firstName: Redacted.value(member.firstName),
      lastName: Redacted.value(member.lastName),
    };
  }
  if (member.firstName !== undefined) {
    return { ...row, firstName: Redacted.value(member.firstName) };
  }
  if (member.lastName !== undefined) {
    return { ...row, lastName: Redacted.value(member.lastName) };
  }
  return row;
};

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
  const dateFormatter = new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
  });

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
      <div className="grid gap-6">
        {account.canManageMembers ? (
          <CompanyMembersManagement
            cancelInvitationAction={cancelCompanyMemberInvitation}
            currentAuthUserId={account.currentAuthUserId}
            invitations={account.people.invitations.map((invitation) =>
              invitationRow(invitation, dateFormatter)
            )}
            members={account.people.members.map(memberRow)}
            reissueInvitationAction={reissueCompanyMemberInvitation}
            removeMemberAction={removeCompanyMember}
          />
        ) : null}
        <CompanyMemberInvitationForm
          canInvite={account.canInvite}
          inviteAction={inviteCompanyMember}
        />
      </div>
    </CustomerArea>
  );
};
