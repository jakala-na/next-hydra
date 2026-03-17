import type { MessageKeys, Messages, NestedKeyOf } from "@repo/i18n";
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
import { RegistrationConflictError, RegistrationNotFoundError } from "./errors";

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

export function createRegistrationApplication(
  storage: RegistrationStorage,
  workflow: RegistrationWorkflowDeps
) {
  const submitRegistration = async (
    input: RegistrationInput
  ): Promise<StartRegistrationResult> => {
    const registrationId = crypto.randomUUID();
    const workflowInput = registrationWorkflowInputSchema.parse({
      ...input,
      registrationId,
    });

    try {
      await storage.createPendingRegistrationRecord(workflowInput);
      const run = await workflow.startWorkflow(workflowInput);

      return {
        registrationId,
        runId: run.runId,
        status: "pending",
      };
    } catch (error) {
      await storage.markRegistrationWorkflowStartFailed(
        workflowInput,
        "gate.failed.description" as RegistrationMessageKey
      );
      throw error;
    }
  };

  const getRegistration = async (
    input: GetRegistrationInput
  ): Promise<RegistrationDetail> => {
    const { registrationId } = getRegistrationInputSchema.parse(input);
    const record = await storage.getRegistrationRecord(registrationId);

    if (!record) {
      throw new RegistrationNotFoundError("Registration not found");
    }

    return toRegistrationDetail(record);
  };

  const listRegistrations = async (
    input: ListRegistrationsInput
  ): Promise<ListRegistrationsResult> => {
    const parsedInput = listRegistrationsInputSchema.parse(input);
    const limit = parsedInput.limit ?? DEFAULT_LIST_LIMIT;
    const records = await storage.listRegistrationRecords(MAX_CURSOR_WINDOW);
    const cursor = parsedInput.cursor ? decodeCursor(parsedInput.cursor) : null;

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

    return {
      items,
      nextCursor: next ? encodeCursor(next) : undefined,
    };
  };

  const decideRegistration = async (
    input: DecideRegistrationInput
  ): Promise<DecideRegistrationResult> => {
    const record = await storage.getRegistrationRecord(input.registrationId);

    if (!record) {
      throw new RegistrationNotFoundError("Registration not found");
    }

    if (record.status === "approved") {
      if (!record.invitationId) {
        throw new RegistrationConflictError(
          `Approved registration ${record.registrationId} is missing invitationId`
        );
      }

      return {
        registrationId: record.registrationId,
        status: record.status,
        idempotent: true,
      };
    }

    if (record.status === "rejected") {
      return {
        registrationId: record.registrationId,
        status: record.status,
        idempotent: true,
      };
    }

    if (!record.hookToken) {
      throw new RegistrationConflictError(
        "Registration is not waiting for approval"
      );
    }

    await workflow.resumeApproval(record.hookToken, input);

    return {
      registrationId: record.registrationId,
      status: "resumed",
    };
  };

  return {
    submitRegistration,
    getRegistration,
    listRegistrations,
    decideRegistration,
  };
}
