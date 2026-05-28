import type { EmailMessage, EmailProviderFailure } from "@repo/email";
import { EmailProvider } from "@repo/email";
import RegistrationApprovedTemplate from "@repo/email/templates/registration-approved";
import RegistrationAwaitingApprovalTemplate from "@repo/email/templates/registration-awaiting-approval";
import RegistrationAwaitingApproverTemplate from "@repo/email/templates/registration-awaiting-approver";
import RegistrationRejectedTemplate from "@repo/email/templates/registration-rejected";
import { Effect, Layer, Redacted } from "effect";
import type { Registration } from "../domain/registration";
import {
  RegistrationEmailFailure,
  RegistrationEmails,
} from "./registration-emails";

export interface RegistrationEmailsLayerOptions {
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

const getApprovalUrl = (webUrl: string, registration: Registration) => {
  const url = new URL("/admin/registration-approvals", webUrl);
  url.searchParams.set("registrationId", String(registration.id));
  return url.toString();
};

const toFailure =
  (notification: RegistrationEmailFailure["notification"]) =>
  (cause: EmailProviderFailure) =>
    new RegistrationEmailFailure({
      message: `Failed to send ${notification} email: ${cause.message}`,
      notification,
      cause,
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
  approverEmail,
  webUrl,
}: RegistrationEmailsLayerOptions) =>
  Layer.effect(
    RegistrationEmails,
    Effect.gen(function* () {
      const emailProvider = yield* EmailProvider;

      return RegistrationEmails.of({
        sendAwaitingApprovalToRegistrant: ({ registration }) =>
          sendRegistrationEmail(emailProvider, "registrant_awaiting_approval", {
            to: getRegistrationEmail(registration),
            subject: `${getCompanyName(registration)} registration received`,
            react: (
              <RegistrationAwaitingApprovalTemplate
                companyName={getCompanyName(registration)}
                contactName={getContactName(registration)}
              />
            ),
          }),
        sendAwaitingApprovalToApprover: ({ registration }) =>
          sendRegistrationEmail(emailProvider, "approver_awaiting_approval", {
            to: approverEmail,
            subject: `${getCompanyName(registration)} registration needs review`,
            react: (
              <RegistrationAwaitingApproverTemplate
                approvalUrl={getApprovalUrl(webUrl, registration)}
                companyName={getCompanyName(registration)}
                contactName={getContactName(registration)}
              />
            ),
          }),
        sendApprovedToRegistrant: ({ invitation, registration }) =>
          sendRegistrationEmail(emailProvider, "registrant_approved", {
            to: getRegistrationEmail(registration),
            subject: `${getCompanyName(registration)} account approved`,
            react: (
              <RegistrationApprovedTemplate
                companyName={getCompanyName(registration)}
                contactName={getContactName(registration)}
                onboardingUrl={
                  invitation.acceptInvitationUrl ??
                  new URL("/api/auth/signin", webUrl).toString()
                }
              />
            ),
          }),
        sendRejectedToRegistrant: ({ registration }) =>
          sendRegistrationEmail(emailProvider, "registrant_rejected", {
            to: getRegistrationEmail(registration),
            subject: `${getCompanyName(registration)} registration not approved`,
            react: (
              <RegistrationRejectedTemplate
                companyName={getCompanyName(registration)}
                contactName={getContactName(registration)}
                {...(registration.decision.reason
                  ? { reason: registration.decision.reason }
                  : {})}
              />
            ),
          }),
      });
    })
  );
