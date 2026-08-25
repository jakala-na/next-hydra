"use server";

import { CommerceActions } from "@repo/commerce/runtime";
import { getTranslations } from "@repo/i18n";

import { inviteCompanyMemberFailureMessageKey } from "./action-contract";
import type { InviteCompanyMemberActionResult } from "./action-contract";
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- This package-owned Next boundary constructs an Action procedure from the app-selected runtime binding.
import { makeCustomerAccountProcedures } from "./procedures";

const { inviteCompanyMemberProcedure } =
  makeCustomerAccountProcedures(CommerceActions);

const inviteCompanyMemberAction = inviteCompanyMemberProcedure.toFormAction({
  getFailureMessage: async (error, { locale }) => {
    const t = await getTranslations({
      locale,
      namespace: "web.customerArea.errors",
    });

    return t(inviteCompanyMemberFailureMessageKey(error));
  },
});

export const inviteCompanyMember = async (
  previousResult: InviteCompanyMemberActionResult | null,
  formData: FormData
): Promise<InviteCompanyMemberActionResult> =>
  await inviteCompanyMemberAction(previousResult, formData);
