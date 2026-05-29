"use server";

import type {
  ApproveRegistrationInput,
  RegistrationDecisionResult,
  RejectRegistrationInput,
} from "@repo/registration/components/admin/registration-view-models";
import { revalidatePath } from "next/cache";
import {
  approveRegistration as approveRegistrationService,
  rejectRegistration as rejectRegistrationService,
} from "./admin-registration";

const revalidateRegistrationApprovals = (
  result: RegistrationDecisionResult
) => {
  if (result.status === "accepted") {
    revalidatePath("/admin/registration-approvals");
  }

  return result;
};

export async function approveRegistration(
  input: ApproveRegistrationInput
): Promise<RegistrationDecisionResult> {
  return revalidateRegistrationApprovals(
    await approveRegistrationService(input)
  );
}

export async function rejectRegistration(
  input: RejectRegistrationInput
): Promise<RegistrationDecisionResult> {
  return revalidateRegistrationApprovals(
    await rejectRegistrationService(input)
  );
}
