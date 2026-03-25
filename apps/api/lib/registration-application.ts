import { createCommercetoolsRegistrationStore } from "@repo/commerce/lib/b2b-registration/create-commercetools-registration-store";
import { createRegistrationApplication } from "@repo/registration/application";
import { createWorkflowRegistrationApprovalProcess } from "./create-workflow-registration-approval-process";

export const registrationApplication = createRegistrationApplication(
  createCommercetoolsRegistrationStore(),
  createWorkflowRegistrationApprovalProcess()
);
