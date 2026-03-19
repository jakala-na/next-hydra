import { resend } from "@repo/email";
import type { RegistrationWorkflowInput } from "@repo/registration/domain/types";
import { keys as emailKeys } from "./keys";
import RegistrationApprovedTemplate from "./templates/registration-approved";
import RegistrationAwaitingApprovalTemplate from "./templates/registration-awaiting-approval";

const getContactName = (input: RegistrationWorkflowInput) =>
  `${input.contactFirstName} ${input.contactLastName}`.trim();

export async function sendAwaitingApprovalEmail(
  input: RegistrationWorkflowInput
): Promise<void> {
  await resend.emails.send({
    from: emailKeys().RESEND_FROM,
    to: input.email,
    subject: `${input.companyName} registration received`,
    react: (
      <RegistrationAwaitingApprovalTemplate
        companyName={input.companyName}
        contactName={getContactName(input)}
      />
    ),
  });
}

export async function sendApprovedEmail(
  input: RegistrationWorkflowInput,
  onboardingUrl: string
): Promise<void> {
  await resend.emails.send({
    from: emailKeys().RESEND_FROM,
    to: input.email,
    subject: `${input.companyName} account approved`,
    react: (
      <RegistrationApprovedTemplate
        companyName={input.companyName}
        contactName={getContactName(input)}
        onboardingUrl={onboardingUrl}
      />
    ),
  });
}
