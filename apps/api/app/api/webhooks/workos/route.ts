/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-call -- Registry fragments resolve their selected provider and application aliases only after workspace composition. */
import { makeWorkosWebhookHandler } from "@repo/auth/route-handlers/webhook";

import { dispatchWorkosInvitationEvent } from "@/lib/company-member-invitations/runtime";

export const POST = makeWorkosWebhookHandler({
  onInvitationEvent: dispatchWorkosInvitationEvent,
});
