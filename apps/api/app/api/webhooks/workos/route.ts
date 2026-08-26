import { makeWorkosWebhookHandler } from "@repo/auth/route-handlers/webhook";

import { dispatchWorkosInvitationEvent } from "@/lib/company-member-invitations/runtime";

export const POST = makeWorkosWebhookHandler({
  onInvitationEvent: dispatchWorkosInvitationEvent,
});
