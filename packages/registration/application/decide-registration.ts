import { Result } from "better-result";
import {
  RegistrationConflictError,
  type RegistrationConflictError as RegistrationConflictErrorType,
  RegistrationNotFoundError,
  type RegistrationResult,
} from "../domain/errors";
import type {
  RegistrationApprovalProcessPort,
  RegistrationStorePort,
} from "../domain/ports";
import type {
  DecideRegistrationInput,
  DecideRegistrationResult,
  RegistrationApprovalDecision,
  RegistrationRecord,
} from "../domain/types";

type CreateDecideRegistrationOptions = {
  registrations: RegistrationStorePort;
  approvalProcess: RegistrationApprovalProcessPort;
};

const isSameDecision = (
  storedDecision: RegistrationApprovalDecision["decision"] | undefined,
  requestedDecision: RegistrationApprovalDecision["decision"]
) => storedDecision === requestedDecision;

const getAcceptedDecisionResult = (
  record: RegistrationRecord,
  requestedDecision: RegistrationApprovalDecision["decision"]
):
  | RegistrationResult<DecideRegistrationResult, RegistrationConflictErrorType>
  | undefined => {
  if (record.status === "approval_processing") {
    if (!record.approvalDecision) {
      throw new Error("Approval processing registration is missing decision");
    }

    if (isSameDecision(record.approvalDecision, requestedDecision)) {
      return Result.ok({
        registrationId: record.registrationId,
        status: "approval_processing",
        idempotent: true,
      });
    }

    return Result.err(
      new RegistrationConflictError({
        reason: "decision_already_in_progress",
        registrationId: record.registrationId,
      })
    );
  }

  if (record.status === "approved") {
    if (requestedDecision === "approved") {
      return Result.ok({
        registrationId: record.registrationId,
        status: "approved",
        idempotent: true,
      });
    }

    return Result.err(
      new RegistrationConflictError({
        reason: "approved_registration_cannot_be_rejected",
        registrationId: record.registrationId,
      })
    );
  }

  if (record.status === "rejected") {
    if (requestedDecision === "rejected") {
      return Result.ok({
        registrationId: record.registrationId,
        status: "rejected",
        idempotent: true,
      });
    }

    return Result.err(
      new RegistrationConflictError({
        reason: "rejected_registration_cannot_be_approved",
        registrationId: record.registrationId,
      })
    );
  }

  return undefined;
};

export function createDecideRegistration(
  options: CreateDecideRegistrationOptions
) {
  return async function decideRegistration(
    input: DecideRegistrationInput
  ): Promise<
    RegistrationResult<
      DecideRegistrationResult,
      RegistrationNotFoundError | RegistrationConflictErrorType
    >
  > {
    const recordResult = await options.registrations.getRegistrationRecord(
      input.registrationId
    );

    if (recordResult.isErr()) {
      if (recordResult.error instanceof RegistrationNotFoundError) {
        return Result.err(recordResult.error);
      }

      throw recordResult.error;
    }

    const record = recordResult.value;

    if (record.status === "submitted") {
      return Result.err(
        new RegistrationConflictError({
          reason: "approval_not_ready",
          registrationId: record.registrationId,
        })
      );
    }

    if (record.status === "submission_incomplete") {
      return Result.err(
        new RegistrationConflictError({
          reason: "registration_submission_incomplete",
          registrationId: record.registrationId,
        })
      );
    }

    const acceptedDecisionResult = getAcceptedDecisionResult(
      record,
      input.decision
    );

    if (acceptedDecisionResult) {
      return acceptedDecisionResult;
    }

    const { registrationId: _registrationId, ...approval } = input;
    const processingResult =
      await options.registrations.markRegistrationApprovalProcessing(
        record.registrationId,
        approval
      );

    if (processingResult.isErr()) {
      const currentRecordResult =
        await options.registrations.getRegistrationRecord(
          record.registrationId
        );

      if (currentRecordResult.isOk()) {
        const currentDecisionResult = getAcceptedDecisionResult(
          currentRecordResult.value,
          input.decision
        );

        if (currentDecisionResult) {
          return currentDecisionResult;
        }
      }

      throw processingResult.error;
    }

    const resumeResult = await options.approvalProcess.resumeApproval(
      record.registrationId,
      approval
    );

    if (resumeResult.isErr()) {
      throw resumeResult.error;
    }

    return Result.ok({
      registrationId: record.registrationId,
      status: "approval_processing",
    });
  };
}
