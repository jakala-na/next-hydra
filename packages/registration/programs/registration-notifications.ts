import { Effect } from "effect";
import type { RegistrationId } from "../domain/identity";
import { type InvitationReadError, Invitations } from "../services/invitations";
import {
  type RegistrationEmailFailure,
  RegistrationEmails,
} from "../services/registration-emails";
import {
  type RegistrationReadError,
  Registrations,
} from "../services/registrations";

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
  Registrations | Invitations | RegistrationEmails
> =>
  Effect.gen(function* () {
    const registrations = yield* Registrations;
    const invitations = yield* Invitations;
    const emails = yield* RegistrationEmails;
    const registration = yield* registrations.get(input.registrationId);

    if (registration._tag !== "ApprovedRegistration") {
      return;
    }

    const invitation = yield* invitations.get(registration.invitationId);

    if (invitation._tag !== "PendingInvitation") {
      return;
    }

    yield* emails.sendApprovedToRegistrant({ registration, invitation });
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
