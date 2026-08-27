import type { EmailMessage, EmailProviderFailure } from "@repo/email";
import { EmailProvider } from "@repo/email";
import RegistrationApprovedTemplate from "@repo/email/templates/registration-approved";
import RegistrationAwaitingApprovalTemplate from "@repo/email/templates/registration-awaiting-approval";
import RegistrationAwaitingApproverTemplate from "@repo/email/templates/registration-awaiting-approver";
import RegistrationInvitationExpiredTemplate from "@repo/email/templates/registration-invitation-expired";
import RegistrationRejectedTemplate from "@repo/email/templates/registration-rejected";
import { Effect, Layer, Redacted } from "effect";

import type { Registration } from "../domain/registration";
import {
  RegistrationEmailFailure,
  RegistrationEmails,
} from "./registration-emails";

export interface RegistrationEmailsLayerOptions {
  readonly adminUrl: string;
  readonly approverEmail: string;
  readonly webUrl: string;
}

const getContactName = (registration: Registration) =>
  `${Redacted.value(registration.details.contactFirstName)} ${Redacted.value(
    registration.details.contactLastName
  )}`.trim();

const getRegistrationEmail = (registration: Registration) =>
  Redacted.value(registration.details.email);

const getCompanyName = (registration: Registration) =>
  String(registration.details.companyName);

export const registrationApprovalUrl = (
  adminUrl: string,
  registrationId: string
) => {
  const url = new URL("/registration-approvals", adminUrl);
  url.searchParams.set("registrationId", registrationId);
  return url.toString();
};

const toFailure =
  (notification: RegistrationEmailFailure["notification"]) =>
  (cause: EmailProviderFailure) =>
    new RegistrationEmailFailure({
      cause,
      message: `Failed to send ${notification} email: ${cause.message}`,
      notification,
    });

const sendRegistrationEmail = (
  emailProvider: {
    readonly send: (
      message: EmailMessage
    ) => Effect.Effect<unknown, EmailProviderFailure>;
  },
  notification: RegistrationEmailFailure["notification"],
  message: EmailMessage
) =>
  emailProvider
    .send(message)
    .pipe(Effect.asVoid, Effect.mapError(toFailure(notification)));

export const layerRegistrationEmails = ({
  adminUrl,
  approverEmail,
  webUrl,
}: RegistrationEmailsLayerOptions) =>
  Layer.effect(
    RegistrationEmails,
    Effect.gen(function* () {
      const emailProvider = yield* EmailProvider;

      return RegistrationEmails.of({
        sendApprovedToRegistrant: ({ invitation, registration }) =>
          sendRegistrationEmail(emailProvider, "registrant_approved", {
            react: (
              <RegistrationApprovedTemplate
                companyName={getCompanyName(registration)}
                contactName={getContactName(registration)}
                onboardingUrl={
                  invitation?.acceptInvitationUrl ??
                  new URL("/api/auth/signin", webUrl).toString()
                }
              />
            ),
            subject: `${getCompanyName(registration)} account approved`,
            to: getRegistrationEmail(registration),
          }),
        sendAwaitingApprovalToApprover: ({ registration }) =>
          sendRegistrationEmail(emailProvider, "approver_awaiting_approval", {
            react: (
              <RegistrationAwaitingApproverTemplate
                approvalUrl={registrationApprovalUrl(
                  adminUrl,
                  String(registration.id)
                )}
                companyName={getCompanyName(registration)}
                contactName={getContactName(registration)}
              />
            ),
            subject: `${getCompanyName(
              registration
            )} registration needs review`,
            to: approverEmail,
          }),
        sendAwaitingApprovalToRegistrant: ({ registration }) =>
          sendRegistrationEmail(emailProvider, "registrant_awaiting_approval", {
            react: (
              <RegistrationAwaitingApprovalTemplate
                companyName={getCompanyName(registration)}
                contactName={getContactName(registration)}
              />
            ),
            subject: `${getCompanyName(registration)} registration received`,
            to: getRegistrationEmail(registration),
          }),
        sendInvitationExpiredToRegistrant: ({ registration }) =>
          sendRegistrationEmail(
            emailProvider,
            "registrant_invitation_expired",
            {
              react: (
                <RegistrationInvitationExpiredTemplate
                  companyName={getCompanyName(registration)}
                  contactName={getContactName(registration)}
                  registrationUrl={new URL("/register", webUrl).toString()}
                />
              ),
              subject: `${getCompanyName(registration)} invitation expired`,
              to: getRegistrationEmail(registration),
            }
          ),
        sendRejectedToRegistrant: ({ registration }) =>
          sendRegistrationEmail(emailProvider, "registrant_rejected", {
            react: (
              <RegistrationRejectedTemplate
                companyName={getCompanyName(registration)}
                contactName={getContactName(registration)}
                {...(registration.decision.reason
                  ? { reason: registration.decision.reason }
                  : {})}
              />
            ),
            subject: `${getCompanyName(
              registration
            )} registration not approved`,
            to: getRegistrationEmail(registration),
          }),
      });
    })
  );
