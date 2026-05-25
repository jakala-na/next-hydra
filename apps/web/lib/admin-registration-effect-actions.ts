"use server";

import type {
  ApproveRegistrationInput,
  RegistrationDecisionResult,
  RejectRegistrationInput,
} from "@repo/registration-effect/components/admin/registration-view-models";
import {
  approveRegistrationEffect as approveRegistrationEffectService,
  rejectRegistrationEffect as rejectRegistrationEffectService,
} from "./admin-registration-effect";

export async function approveRegistrationEffect(
  input: ApproveRegistrationInput
): Promise<RegistrationDecisionResult> {
  return await approveRegistrationEffectService(input);
}

export async function rejectRegistrationEffect(
  input: RejectRegistrationInput
): Promise<RegistrationDecisionResult> {
  return await rejectRegistrationEffectService(input);
}
