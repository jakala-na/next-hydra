import { Effect } from "effect";

import type { RegistrationId } from "../domain/identity";
import { InvitationDeliveries } from "../services/invitations";
import type { InvitationReadError } from "../services/invitations";
import { RegistrationEmails } from "../services/registration-emails";
import type { RegistrationEmailFailure } from "../services/registration-emails";
import { Registrations } from "../services/registrations";
import type { RegistrationReadError } from "../services/registrations";

export interface NotifyRegistrationInput {
  readonly registrationId: RegistrationId;
}

export const notifyRegistrationAwaitingApproval = (
  input: NotifyRegistrationInput
): Effect.Effect<
  void,
  RegistrationReadError | RegistrationEmailFailure,
  Registrations | RegistrationEmails
> =>
  Effect.gen(function* () {
    const registrations = yield* Registrations;
    const emails = yield* RegistrationEmails;
    const registration = yield* registrations.get(input.registrationId);

    if (registration._tag !== "AwaitingApprovalRegistration") {
      return;
    }

    yield* emails.sendAwaitingApprovalToRegistrant({ registration });
    yield* emails.sendAwaitingApprovalToApprover({ registration });
  });

export const notifyRegistrationApproved = (
  input: NotifyRegistrationInput
): Effect.Effect<
  void,
  RegistrationReadError | InvitationReadError | RegistrationEmailFailure,
  Registrations | InvitationDeliveries | RegistrationEmails
> =>
  Effect.gen(function* () {
    const registrations = yield* Registrations;
    const deliveries = yield* InvitationDeliveries;
    const emails = yield* RegistrationEmails;
    const registration = yield* registrations.get(input.registrationId);

    if (registration._tag !== "ApprovedRegistration") {
      return;
    }
    if (registration.invitationId === undefined) {
      return yield* emails.sendApprovedToRegistrant({ registration });
    }

    const invitation = yield* deliveries.get(registration.invitationId);

    if (
      invitation.status !== "pending" ||
      invitation.acceptInvitationUrl === undefined
    ) {
      return;
    }

    yield* emails.sendApprovedToRegistrant({ invitation, registration });
  });

export const notifyRegistrationRejected = (
  input: NotifyRegistrationInput
): Effect.Effect<
  void,
  RegistrationReadError | RegistrationEmailFailure,
  Registrations | RegistrationEmails
> =>
  Effect.gen(function* () {
    const registrations = yield* Registrations;
    const emails = yield* RegistrationEmails;
    const registration = yield* registrations.get(input.registrationId);

    if (registration._tag !== "RejectedRegistration") {
      return;
    }

    yield* emails.sendRejectedToRegistrant({ registration });
  });

export const notifyRegistrationInvitationExpired = (
  input: NotifyRegistrationInput
): Effect.Effect<
  void,
  RegistrationReadError | RegistrationEmailFailure,
  Registrations | RegistrationEmails
> =>
  Effect.gen(function* () {
    const registrations = yield* Registrations;
    const emails = yield* RegistrationEmails;
    const registration = yield* registrations.get(input.registrationId);

    if (registration._tag !== "ApprovedRegistration") {
      return;
    }

    yield* emails.sendInvitationExpiredToRegistrant({ registration });
  });
