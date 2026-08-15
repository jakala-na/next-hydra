import { getRegistrationApprovalHookToken } from "@repo/registration";
import { RegistrationApiError } from "@repo/registration/http/registration-api";
import type { RegistrationReviewWorkflowDecision } from "@repo/registration/programs/registration-review";
import { Effect } from "effect";
import { resumeHook, start } from "workflow/api";

import { registerCompanyWorkflow } from "@/workflows/register-company";

import { apiAuthenticationLayer } from "../auth/runtime";
import { makeRegistrationHttpHandler } from "./http";
import { registrationLayer } from "./runtime";

const toWorkflowApiError = (cause: unknown, fallbackMessage: string) =>
  new RegistrationApiError({
    message: cause instanceof Error ? cause.message : fallbackMessage,
  });

const startRegistrationWorkflow = (registrationId: string) =>
  Effect.tryPromise({
    catch: (cause) =>
      toWorkflowApiError(cause, "Registration workflow could not be started"),
    try: () => start(registerCompanyWorkflow, [{ registrationId }]),
  });

const resumeRegistrationWorkflow = (
  registrationId: string,
  decision: RegistrationReviewWorkflowDecision
) =>
  Effect.tryPromise({
    catch: (cause) =>
      toWorkflowApiError(cause, "Registration workflow could not be resumed"),
    try: () =>
      resumeHook(getRegistrationApprovalHookToken(registrationId), decision),
  });

const registrationHttp = makeRegistrationHttpHandler({
  authenticationLayer: apiAuthenticationLayer,
  layer: registrationLayer,
  resumeRegistrationWorkflow,
  startRegistrationWorkflow,
});

export const registrationHttpHandler = registrationHttp.handler;
