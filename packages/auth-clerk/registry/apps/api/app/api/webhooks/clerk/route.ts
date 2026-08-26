/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-call -- Registry fragments resolve their selected provider and application aliases only after workspace composition. */
import { makeClerkWebhookHandler } from "@repo/auth/routes/webhooks/auth/route";

import { acceptCompanyMemberInvitationForClerk } from "@/lib/company-member-invitations/runtime";
import { resumeRegistrationInvitationForRegistration } from "@/lib/registration/workflow-runtime";

export const POST = makeClerkWebhookHandler({
  onCompanyMemberInvitationAccepted: acceptCompanyMemberInvitationForClerk,
  onRegistrationInvitationEvent: resumeRegistrationInvitationForRegistration,
});
