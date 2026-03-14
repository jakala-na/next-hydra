import {
  createWorkosInvitation,
  type WorkosInvitation,
} from "@repo/auth-workos/admin";
import type {
  RegistrationApprovalDecision,
  RegistrationWorkflowInput,
} from "@repo/commerce/lib/b2b-registration/schema";
import {
  createPendingCustomerAndBusinessUnit,
  logRegistrationError,
  saveRegistrationHookToken,
  saveRegistrationInvitation,
  updateRegistrationApprovalStatus,
} from "@repo/commerce/lib/b2b-registration/service";
import {
  sendApprovedEmail,
  sendAwaitingApprovalEmail,
} from "@repo/email/registration";
import { createHook } from "workflow";

async function createCommerceResources(input: RegistrationWorkflowInput) {
  "use step";
  return await createPendingCustomerAndBusinessUnit(input);
}

async function notifyAwaitingApproval(input: RegistrationWorkflowInput) {
  "use step";
  await sendAwaitingApprovalEmail(input);
}

async function persistHookToken(registrationId: string, hookToken: string) {
  "use step";
  await saveRegistrationHookToken(registrationId, hookToken);
}

async function markApprovalDecision(
  registrationId: string,
  approval: RegistrationApprovalDecision
) {
  "use step";
  return await updateRegistrationApprovalStatus(registrationId, approval);
}

async function createInvitation(email: string) {
  "use step";
  return await createWorkosInvitation({ email });
}

async function persistInvitation(
  registrationId: string,
  invitation: Pick<WorkosInvitation, "id" | "state">
) {
  "use step";
  await saveRegistrationInvitation(registrationId, invitation);
}

async function notifyApproved(
  input: RegistrationWorkflowInput,
  onboardingUrl: string
) {
  "use step";
  await sendApprovedEmail(input, onboardingUrl);
}

async function captureWorkflowFailure(registrationId: string, error: unknown) {
  "use step";
  await logRegistrationError(registrationId, error);
}

export async function registerCompanyWorkflow(
  input: RegistrationWorkflowInput
) {
  "use workflow";

  try {
    await notifyAwaitingApproval(input);

    const approvalHook = createHook<RegistrationApprovalDecision>();
    await persistHookToken(input.registrationId, approvalHook.token);

    const approval = await approvalHook;
    if (approval.decision === "rejected") {
      return markApprovalDecision(input.registrationId, approval);
    }

    await createCommerceResources(input);
    const invitation = await createInvitation(input.email);
    await persistInvitation(input.registrationId, invitation);
    const record = await markApprovalDecision(input.registrationId, approval);
    await notifyApproved(input, invitation.acceptInvitationUrl);

    return record;
  } catch (error) {
    await captureWorkflowFailure(input.registrationId, error);
    throw error;
  }
}
