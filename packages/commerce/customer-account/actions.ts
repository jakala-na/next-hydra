"use server";

import { NextServer } from "@repo/actions/next-server";
import { CommerceActions, NextCommerce } from "@repo/commerce/runtime";
import { getTranslations } from "@repo/i18n";
import type { Locale } from "@repo/i18n/types";
import { Effect } from "effect";

import { inviteCompanyMemberFailureMessageKey } from "./action-contract";
import type {
  CompanyMemberManagementActionResult,
  InviteCompanyMemberActionResult,
} from "./action-contract";
// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- This package-owned Next boundary constructs an Action procedure from the app-selected runtime binding.
import { makeCustomerAccountProcedures } from "./procedures";

const {
  cancelCompanyMemberInvitationProcedure,
  inviteCompanyMemberProcedure,
  reissueCompanyMemberInvitationProcedure,
  removeCompanyMemberProcedure,
} = makeCustomerAccountProcedures(CommerceActions);

const failureMessage = async (
  error: Parameters<typeof inviteCompanyMemberFailureMessageKey>[0],
  { locale }: { readonly locale: Locale }
) => {
  const t = await getTranslations({
    locale,
    namespace: "web.customerArea.errors",
  });

  return t(inviteCompanyMemberFailureMessageKey(error));
};

const refreshCustomerAccount = async () => {
  await NextCommerce.runPromise(
    NextServer.pipe(Effect.flatMap((next) => next.refresh()))
  );
};

const actionPresentation = {
  getFailureMessage: failureMessage,
  onSuccess: refreshCustomerAccount,
};

const inviteCompanyMemberAction =
  inviteCompanyMemberProcedure.toFormAction(actionPresentation);

const cancelCompanyMemberInvitationAction =
  cancelCompanyMemberInvitationProcedure.toFormAction(actionPresentation);
const reissueCompanyMemberInvitationAction =
  reissueCompanyMemberInvitationProcedure.toFormAction(actionPresentation);
const removeCompanyMemberAction =
  removeCompanyMemberProcedure.toFormAction(actionPresentation);

export const cancelCompanyMemberInvitation = async (
  previousResult: CompanyMemberManagementActionResult | null,
  formData: FormData
): Promise<CompanyMemberManagementActionResult> =>
  await cancelCompanyMemberInvitationAction(previousResult, formData);

export const inviteCompanyMember = async (
  previousResult: InviteCompanyMemberActionResult | null,
  formData: FormData
): Promise<InviteCompanyMemberActionResult> =>
  await inviteCompanyMemberAction(previousResult, formData);

export const reissueCompanyMemberInvitation = async (
  previousResult: CompanyMemberManagementActionResult | null,
  formData: FormData
): Promise<CompanyMemberManagementActionResult> =>
  await reissueCompanyMemberInvitationAction(previousResult, formData);

export const removeCompanyMember = async (
  previousResult: CompanyMemberManagementActionResult | null,
  formData: FormData
): Promise<CompanyMemberManagementActionResult> =>
  await removeCompanyMemberAction(previousResult, formData);
