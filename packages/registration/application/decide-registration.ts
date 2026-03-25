import { Result } from "better-result";
import {
  RegistrationConflictError,
  type RegistrationResult,
} from "../domain/errors";
import type {
  RegistrationApprovalProcessPort,
  RegistrationStorePort,
} from "../domain/ports";
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
  ): Promise<RegistrationResult<DecideRegistrationResult>> {
    const recordResult = await options.registrations.getRegistrationRecord(
      input.registrationId
    );

    if (recordResult.isErr()) {
      return Result.err(recordResult.error);
    }

    const record = recordResult.value;

    if (record.status === "approved") {
      return Result.err(
        new RegistrationConflictError({
          reason: "already_approved",
          registrationId: record.registrationId,
        })
      );
    }

    if (record.status === "rejected") {
      return Result.err(
        new RegistrationConflictError({
          reason: "already_rejected",
          registrationId: record.registrationId,
        })
      );
    }

    if (!record.hookToken) {
      return Result.err(
        new RegistrationConflictError({
          reason: "not_waiting_for_approval",
          registrationId: record.registrationId,
        })
      );
    }

    const hookToken = record.hookToken;

    const resumeResult = await options.approvalProcess.resumeApproval(
      hookToken,
      input
    );

    if (resumeResult.isErr()) {
      return Result.err(resumeResult.error);
    }

    return Result.ok({
      registrationId: record.registrationId,
      status: "resumed",
    });
  };
}
