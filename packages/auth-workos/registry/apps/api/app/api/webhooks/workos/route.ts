import { makeWorkosWebhookHandler } from "@repo/auth/route-handlers/webhook";

import { resumeRegistrationInvitation } from "@/lib/registration/workflow-runtime";

export const POST = makeWorkosWebhookHandler({
  onInvitationEvent: resumeRegistrationInvitation,
});
