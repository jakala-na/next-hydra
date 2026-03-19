import {
  type RegistrationActionResult,
  registrationConflictError,
  registrationNotFoundError,
  unknownRegistrationError,
} from "../domain/errors";
import type {
  RegistrationApprovalProcessPort,
  RegistrationStorePort,
} from "../domain/ports";
import { Err, Ok } from "../domain/result";
import type {
  DecideRegistrationInput,
  DecideRegistrationResult,
} from "../domain/types";

type CreateDecideRegistrationOptions = {
  registrations: RegistrationStorePort;
  approvalProcess: RegistrationApprovalProcessPort;
};

export function createDecideRegistration(
  options: CreateDecideRegistrationOptions
) {
  return async function decideRegistration(
    input: DecideRegistrationInput
  ): Promise<RegistrationActionResult<DecideRegistrationResult>> {
    try {
      const record = await options.registrations.getRegistrationRecord(
        input.registrationId
      );

      if (!record) {
        return Err(registrationNotFoundError(input.registrationId));
      }

      if (record.status === "approved") {
        return Err(
          registrationConflictError("already_approved", record.registrationId)
        );
      }

      if (record.status === "rejected") {
        return Err(
          registrationConflictError("already_rejected", record.registrationId)
        );
      }

      if (!record.hookToken) {
        return Err(
          registrationConflictError(
            "not_waiting_for_approval",
            record.registrationId
          )
        );
      }

      if (input.decision === "approved" && !record.invitationId) {
        return Err(
          registrationConflictError("missing_invitation", record.registrationId)
        );
      }

      await options.approvalProcess.resumeApproval(record.hookToken, input);

      return Ok({
        registrationId: record.registrationId,
        status: "resumed",
      });
    } catch (error) {
      return Err(unknownRegistrationError("decide", error));
    }
  };
}
