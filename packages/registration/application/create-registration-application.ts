import type { MessageKeys, Messages, NestedKeyOf } from "@repo/i18n";
import type {
  RegistrationConflictReason,
  RegistrationErrorCode,
  RegistrationErrorData,
  RegistrationOperation,
} from "../contracts/error-codes";
import {
  type DecideRegistrationInput,
  type DecideRegistrationResult,
  type GetRegistrationInput,
  getRegistrationInputSchema,
  type ListRegistrationsInput,
  type ListRegistrationsResult,
  listRegistrationsInputSchema,
  type RegistrationApprovalDecision,
  type RegistrationDetail,
  type RegistrationInput,
  type RegistrationRecord,
  type RegistrationWorkflowInput,
  registrationWorkflowInputSchema,
  type StartRegistrationResult,
} from "../contracts/schema";
import { type ActionResult, domainError, Err, Ok } from "../lib/result";

type RegistrationMessageKey = MessageKeys<
  Messages["web"]["registration"],
  NestedKeyOf<Messages["web"]["registration"]>
>;

type RegistrationStorage = {
  createPendingRegistrationRecord(
    input: RegistrationWorkflowInput
  ): Promise<RegistrationRecord>;
  markRegistrationWorkflowStartFailed(
    input: RegistrationWorkflowInput,
    reason?: string
  ): Promise<RegistrationRecord>;
  getRegistrationRecord(
    registrationId: string
  ): Promise<RegistrationRecord | null>;
  listRegistrationRecords(limit: number): Promise<RegistrationRecord[]>;
};

type RegistrationWorkflowDeps = {
  startWorkflow(
    input: RegistrationWorkflowInput
  ): Promise<Pick<StartRegistrationResult, "runId">>;
  resumeApproval(
    hookToken: string,
    approval: RegistrationApprovalDecision
  ): Promise<void>;
};

export type RegistrationApplication = ReturnType<
  typeof createRegistrationApplication
>;

type RegistrationApplicationResult<T> = ActionResult<
  T,
  RegistrationErrorCode,
  RegistrationErrorData
>;

const DEFAULT_LIST_LIMIT = 20;
const MAX_CURSOR_WINDOW = 100;

const toRegistrationDetail = (
  record: RegistrationRecord
): RegistrationDetail => {
  const {
    hookToken: _hookToken,
    customerId: _customerId,
    customerKey: _customerKey,
    businessUnitId: _businessUnitId,
    businessUnitKey: _businessUnitKey,
    ...detail
  } = record;

  return detail satisfies RegistrationDetail;
};

const matchesSearch = (record: RegistrationRecord, search: string) => {
  const query = search.toLowerCase();

  if (query.length === 0) {
    return true;
  }

  const haystack = [
    record.companyName,
    record.contactFirstName,
    record.contactLastName,
    record.email,
  ]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());

  return haystack.some((value) => value.includes(query));
};

const encodeCursor = (record: RegistrationRecord) =>
  Buffer.from(
    JSON.stringify({
      registrationId: record.registrationId,
      updatedAt: record.updatedAt,
    })
  ).toString("base64url");

const decodeCursor = (cursor: string) => {
  try {
    const decoded = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8")
    );

    if (
      typeof decoded !== "object" ||
      decoded === null ||
      typeof decoded.registrationId !== "string" ||
      typeof decoded.updatedAt !== "string"
    ) {
      return null;
    }

    return decoded as {
      registrationId: string;
      updatedAt: string;
    };
  } catch {
    return null;
  }
};

const unknownError = (operation: RegistrationOperation, cause: unknown) =>
  domainError(
    "UNKNOWN",
    `Registration ${operation} failed`,
    { operation },
    cause
  );

const submitFailedError = (cause: unknown) =>
  domainError(
    "SUBMIT_FAILED",
    "Registration workflow failed to start",
    { reason: "workflow_start_failed" as const },
    cause
  );

const registrationNotFoundError = (registrationId?: string) =>
  domainError(
    "REGISTRATION_NOT_FOUND",
    "Registration not found",
    registrationId ? { registrationId } : {}
  );

const registrationConflictError = (
  reason: RegistrationConflictReason,
  registrationId?: string
) =>
  domainError(
    "REGISTRATION_CONFLICT",
    "Registration cannot be processed in its current state",
    {
      registrationId,
      reason,
    }
  );

export function createRegistrationApplication(
  storage: RegistrationStorage,
  workflow: RegistrationWorkflowDeps
) {
  const submitRegistration = async (
    input: RegistrationInput
  ): Promise<RegistrationApplicationResult<StartRegistrationResult>> => {
    const registrationId = crypto.randomUUID();
    const workflowInput = registrationWorkflowInputSchema.parse({
      ...input,
      registrationId,
    });

    try {
      await storage.createPendingRegistrationRecord(workflowInput);
      const run = await workflow.startWorkflow(workflowInput);

      return Ok({
        registrationId,
        runId: run.runId,
        status: "pending",
      });
    } catch (error) {
      try {
        await storage.markRegistrationWorkflowStartFailed(
          workflowInput,
          "gate.failed.description" as RegistrationMessageKey
        );
      } catch (markError) {
        return Err(unknownError("submit", markError));
      }

      return Err(submitFailedError(error));
    }
  };

  const getRegistration = async (
    input: GetRegistrationInput
  ): Promise<RegistrationApplicationResult<RegistrationDetail>> => {
    const { registrationId } = getRegistrationInputSchema.parse(input);

    try {
      const record = await storage.getRegistrationRecord(registrationId);

      if (!record) {
        return Err(registrationNotFoundError(registrationId));
      }

      return Ok(toRegistrationDetail(record));
    } catch (error) {
      return Err(unknownError("get", error));
    }
  };

  const listRegistrations = async (
    input: ListRegistrationsInput
  ): Promise<RegistrationApplicationResult<ListRegistrationsResult>> => {
    const parsedInput = listRegistrationsInputSchema.parse(input);

    try {
      const limit = parsedInput.limit ?? DEFAULT_LIST_LIMIT;
      const records = await storage.listRegistrationRecords(MAX_CURSOR_WINDOW);
      const cursor = parsedInput.cursor
        ? decodeCursor(parsedInput.cursor)
        : null;

      const filtered = records
        .filter((record) =>
          parsedInput.status ? record.status === parsedInput.status : true
        )
        .filter((record) =>
          parsedInput.search ? matchesSearch(record, parsedInput.search) : true
        )
        .filter((record) => {
          if (!cursor) {
            return true;
          }

          if (record.updatedAt < cursor.updatedAt) {
            return true;
          }

          if (record.updatedAt > cursor.updatedAt) {
            return false;
          }

          return record.registrationId < cursor.registrationId;
        });

      const items = filtered.slice(0, limit).map(toRegistrationDetail);
      const next = filtered[limit];

      return Ok({
        items,
        nextCursor: next ? encodeCursor(next) : undefined,
      });
    } catch (error) {
      return Err(unknownError("list", error));
    }
  };

  const decideRegistration = async (
    input: DecideRegistrationInput
  ): Promise<RegistrationApplicationResult<DecideRegistrationResult>> => {
    try {
      const record = await storage.getRegistrationRecord(input.registrationId);

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

      await workflow.resumeApproval(record.hookToken, input);

      return Ok({
        registrationId: record.registrationId,
        status: "resumed",
      });
    } catch (error) {
      return Err(unknownError("decide", error));
    }
  };

  return {
    submitRegistration,
    getRegistration,
    listRegistrations,
    decideRegistration,
  };
}
