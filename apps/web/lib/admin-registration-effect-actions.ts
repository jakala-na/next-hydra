"use server";

import type {
  ApproveRegistrationInput,
  RegistrationDecisionResult,
  RejectRegistrationInput,
} from "@repo/registration-effect/components/admin/registration-view-models";
import { revalidatePath } from "next/cache";
import {
  approveRegistrationEffect as approveRegistrationEffectService,
  rejectRegistrationEffect as rejectRegistrationEffectService,
} from "./admin-registration-effect";

const revalidateRegistrationApprovals = (
  result: RegistrationDecisionResult
) => {
  if (result.status === "accepted") {
    revalidatePath("/admin/registration-approvals");
  }

  return result;
};

export async function approveRegistrationEffect(
  input: ApproveRegistrationInput
): Promise<RegistrationDecisionResult> {
  return revalidateRegistrationApprovals(
    await approveRegistrationEffectService(input)
  );
}

export async function rejectRegistrationEffect(
  input: RejectRegistrationInput
): Promise<RegistrationDecisionResult> {
  return revalidateRegistrationApprovals(
    await rejectRegistrationEffectService(input)
  );
}
