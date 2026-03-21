import { Result } from "better-result";
import {
  RegistrationApprovalProcessError,
  RegistrationConflictError,
  RegistrationNotFoundError,
  type RegistrationResult,
  RegistrationStoreError,
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
    const recordResult = await Result.tryPromise({
      try: () =>
        options.registrations.getRegistrationRecord(input.registrationId),
      catch: (cause) =>
        new RegistrationStoreError({
          operation: "get_registration_record",
          cause,
        }),
    });

    if (recordResult.isErr()) {
      return recordResult;
    }

    const record = recordResult.value;

    if (!record) {
      return Result.err(
        new RegistrationNotFoundError({ registrationId: input.registrationId })
      );
    }

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

    const resumeResult = await Result.tryPromise({
      try: () => options.approvalProcess.resumeApproval(hookToken, input),
      catch: (cause) =>
        new RegistrationApprovalProcessError({
          operation: "resume_approval",
          cause,
        }),
    });

    if (resumeResult.isErr()) {
      return resumeResult;
    }

    return Result.ok({
      registrationId: record.registrationId,
      status: "resumed",
    });
  };
}
