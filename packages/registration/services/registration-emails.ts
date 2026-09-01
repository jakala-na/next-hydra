import { Context, Effect, Layer, Ref, Schema } from "effect";

import type { InvitationDelivery } from "../domain/invitations";
import type {
  ApprovedRegistration,
  AwaitingApprovalRegistration,
  RejectedRegistration,
} from "../domain/registration";

export class RegistrationEmailFailure extends Schema.TaggedError<RegistrationEmailFailure>()(
  "RegistrationEmailFailure",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    notification: Schema.Literals([
      "registrant_awaiting_approval",
      "approver_awaiting_approval",
      "registrant_approved",
      "registrant_invitation_expired",
      "registrant_rejected",
    ]),
  }
) {}

export interface SendAwaitingApprovalRegistrantEmailInput {
  readonly registration: AwaitingApprovalRegistration;
}

export interface SendAwaitingApprovalApproverEmailInput {
  readonly registration: AwaitingApprovalRegistration;
}

export interface SendApprovedRegistrantEmailInput {
  readonly registration: ApprovedRegistration;
  readonly invitation?: InvitationDelivery;
}

export interface SendRejectedRegistrantEmailInput {
  readonly registration: RejectedRegistration;
}

export interface SendInvitationExpiredRegistrantEmailInput {
  readonly registration: ApprovedRegistration;
}

export type RegistrationEmailNotification =
  | {
      readonly notification: "registrant_awaiting_approval";
      readonly registrationId: string;
    }
  | {
      readonly notification: "approver_awaiting_approval";
      readonly registrationId: string;
    }
  | {
      readonly notification: "registrant_approved";
      readonly registrationId: string;
    }
  | {
      readonly notification: "registrant_invitation_expired";
      readonly registrationId: string;
    }
  | {
      readonly notification: "registrant_rejected";
      readonly registrationId: string;
    };

export class RegistrationEmails extends Context.Service<
  RegistrationEmails,
  {
    readonly sendAwaitingApprovalToRegistrant: (
      input: SendAwaitingApprovalRegistrantEmailInput
    ) => Effect.Effect<void, RegistrationEmailFailure>;
    readonly sendAwaitingApprovalToApprover: (
      input: SendAwaitingApprovalApproverEmailInput
    ) => Effect.Effect<void, RegistrationEmailFailure>;
    readonly sendApprovedToRegistrant: (
      input: SendApprovedRegistrantEmailInput
    ) => Effect.Effect<void, RegistrationEmailFailure>;
    readonly sendInvitationExpiredToRegistrant: (
      input: SendInvitationExpiredRegistrantEmailInput
    ) => Effect.Effect<void, RegistrationEmailFailure>;
    readonly sendRejectedToRegistrant: (
      input: SendRejectedRegistrantEmailInput
    ) => Effect.Effect<void, RegistrationEmailFailure>;
  }
>()("@repo/registration/RegistrationEmails") {
  static readonly layerMemory = Layer.effect(
    RegistrationEmails,
    Effect.gen(function* () {
      const sent = yield* Ref.make<readonly RegistrationEmailNotification[]>(
        []
      );

      const record = (notification: RegistrationEmailNotification) =>
        Ref.update(sent, (notifications) => [...notifications, notification]);

      return RegistrationEmails.of({
        sendApprovedToRegistrant: ({ registration }) =>
          record({
            notification: "registrant_approved",
            registrationId: String(registration.id),
          }),
        sendAwaitingApprovalToApprover: ({ registration }) =>
          record({
            notification: "approver_awaiting_approval",
            registrationId: String(registration.id),
          }),
        sendAwaitingApprovalToRegistrant: ({ registration }) =>
          record({
            notification: "registrant_awaiting_approval",
            registrationId: String(registration.id),
          }),
        sendInvitationExpiredToRegistrant: ({ registration }) =>
          record({
            notification: "registrant_invitation_expired",
            registrationId: String(registration.id),
          }),
        sendRejectedToRegistrant: ({ registration }) =>
          record({
            notification: "registrant_rejected",
            registrationId: String(registration.id),
          }),
      });
    })
  );
}
