import {
  createPendingRegistrationRecord,
  getRegistrationRecord,
  listRegistrationRecords,
  markRegistrationWorkflowStartFailed,
} from "@repo/commerce/lib/b2b-registration/service";
import { createRegistrationApplication } from "@repo/registration/application";
import type {
  RegistrationApprovalDecision,
  RegistrationWorkflowInput,
} from "@repo/registration/domain/types";
import { resumeHook, start } from "workflow/api";
import { registerCompanyWorkflow } from "@/workflows/register-company";

const startWorkflow = async (input: RegistrationWorkflowInput) => {
  const run = await start(registerCompanyWorkflow, [input]);

  return {
    runId: run.runId,
  };
};

const resumeApproval = async (
  hookToken: string,
  approval: RegistrationApprovalDecision
) => {
  await resumeHook(hookToken, approval);
};

export const registrationApplication = createRegistrationApplication(
  {
    createPendingRegistrationRecord,
    getRegistrationRecord,
    listRegistrationRecords,
    markRegistrationWorkflowStartFailed,
  },
  {
    startWorkflow,
    resumeApproval,
  }
);
