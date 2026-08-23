import { makeClerkWebhookHandler } from "@repo/auth/routes/webhooks/auth/route";

import { resumeRegistrationInvitationForRegistration } from "@/lib/registration/workflow-runtime";

export const POST = makeClerkWebhookHandler({
  onRegistrationInvitationEvent: resumeRegistrationInvitationForRegistration,
});
