import {
  type RegistrationResult,
  RegistrationStoreError,
} from "@repo/registration/domain/errors";
import type {
  DecideRegistrationResult,
  RegistrationApprovalDecision,
  RegistrationRecord,
  RegistrationStatus,
  RegistrationWorkflowInput,
} from "@repo/registration/domain/types";
import { getRegistrationApprovalHookToken } from "@repo/registration/domain/types";
import { beforeEach, expect, test, vi } from "vitest";

const createPendingRegistrationRecord = vi.fn();
const getRegistrationRecord = vi.fn();
const listRegistrationRecords = vi.fn();
const markRegistrationApprovalProcessing = vi.fn();
const markRegistrationSubmissionIncomplete = vi.fn();
const start = vi.fn();
const resumeHook = vi.fn();
const registerCompanyWorkflow = vi.fn();

vi.mock("@repo/commerce/lib/b2b-registration/service", () => ({
  createPendingRegistrationRecord,
  getRegistrationRecord,
  listRegistrationRecords,
  markRegistrationApprovalProcessing,
  markRegistrationSubmissionIncomplete,
}));

vi.mock("workflow/api", () => ({
  resumeHook,
  start,
}));

vi.mock("@/workflows/register-company", () => ({
  registerCompanyWorkflow,
}));

const loadApplication = async () => import("../lib/registration-application");

const registrationInput = {
  companyName: "Hydra Industrial",
  companyPhone: "",
  vatId: "",
  contactFirstName: "Ava",
  contactLastName: "Stone",
  email: "ava@example.com",
  address: {
    streetName: "Canal Street",
    additionalStreetInfo: "",
    postalCode: "10013",
    city: "New York",
    region: "NY",
    country: "US",
  },
};

const adminActor = {
  actorEmail: "admin@example.com",
  actorName: "Ava Admin",
};

beforeEach(() => {
  vi.resetModules();
  createPendingRegistrationRecord.mockReset();
  getRegistrationRecord.mockReset();
  listRegistrationRecords.mockReset();
  markRegistrationApprovalProcessing.mockReset();
  markRegistrationSubmissionIncomplete.mockReset();
  start.mockReset();
  resumeHook.mockReset();
  registerCompanyWorkflow.mockReset();
});

const createRegistrationRecord = (
  status: RegistrationStatus,
  overrides: Partial<RegistrationRecord> = {}
): RegistrationRecord => ({
  ...registrationInput,
  registrationId: crypto.randomUUID(),
  status,
  createdAt: "2026-03-22T00:00:00.000Z",
  updatedAt: "2026-03-22T00:00:00.000Z",
  ...overrides,
});

const getConflictReason = (
  result: RegistrationResult<DecideRegistrationResult>
): string => {
  if (result.isErr()) {
    if (result.error.name !== "RegistrationConflictError") {
      throw result.error;
    }

    return (result.error as { reason: string }).reason;
  }

  throw new Error("Expected registration conflict");
};

test("getRegistration returns a typed not found error", async () => {
  const registrationId = crypto.randomUUID();
  getRegistrationRecord.mockResolvedValue(null);

  const { registrationApplication } = await loadApplication();
  const result = await registrationApplication.getRegistration({
    registrationId,
  });

  expect(getRegistrationRecord).toHaveBeenCalledWith(registrationId);
  expect(result.isErr()).toBe(true);

  if (result.isErr()) {
    if (result.error.name !== "RegistrationNotFoundError") {
      throw result.error;
    }

    const error = result.error as { registrationId?: string };
    expect(error.registrationId).toBe(registrationId);
  }
});

test("getRegistration panics on store exceptions", async () => {
  getRegistrationRecord.mockRejectedValue(new Error("store read failed"));

  const { registrationApplication } = await loadApplication();

  await expect(
    registrationApplication.getRegistration({
      registrationId: crypto.randomUUID(),
    })
  ).rejects.toMatchObject({
    name: "RegistrationStoreError",
    operation: "get_registration_record",
  });
});

test("submitRegistration creates a submitted registration and returns submitted", async () => {
  createPendingRegistrationRecord.mockImplementation(
    async (input: RegistrationWorkflowInput) => ({
      ...input,
      status: "submitted",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:00.000Z",
    })
  );
  start.mockResolvedValue({ runId: "run_123" });

  const { registrationApplication } = await loadApplication();
  const result =
    await registrationApplication.submitRegistration(registrationInput);

  expect(createPendingRegistrationRecord).toHaveBeenCalledWith(
    expect.objectContaining({
      ...registrationInput,
      registrationId: expect.any(String),
    })
  );
  expect(result.isOk()).toBe(true);

  if (result.isOk()) {
    expect(result.value).toMatchObject({
      registrationId: expect.any(String),
      runId: "run_123",
      status: "submitted",
    });
  }
});

test("submitRegistration marks submission incomplete when workflow start fails", async () => {
  createPendingRegistrationRecord.mockImplementation(
    async (input: RegistrationWorkflowInput) => ({
      ...input,
      status: "submitted",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:00.000Z",
    })
  );
  start.mockRejectedValue(new Error("workflow failed"));
  markRegistrationSubmissionIncomplete.mockImplementation(
    async (input: RegistrationWorkflowInput) => ({
      ...input,
      status: "submission_incomplete",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:01.000Z",
    })
  );

  const { registrationApplication } = await loadApplication();
  const result =
    await registrationApplication.submitRegistration(registrationInput);

  expect(start).toHaveBeenCalledOnce();
  expect(markRegistrationSubmissionIncomplete).toHaveBeenCalledWith(
    expect.objectContaining({
      ...registrationInput,
      registrationId: expect.any(String),
    })
  );
  expect(result.isErr()).toBe(true);

  if (result.isErr()) {
    if (result.error.name !== "RegistrationSubmissionIncompleteError") {
      throw result.error;
    }

    const error = result.error as {
      cause: unknown;
      registrationId: string;
    };
    expect(error.registrationId).toEqual(expect.any(String));
    expect(error.cause).toBeInstanceOf(Error);
    expect((error.cause as Error).message).toBe("workflow failed");
  }
});

test("submitRegistration panics when submission incomplete persistence fails", async () => {
  createPendingRegistrationRecord.mockImplementation(
    async (input: RegistrationWorkflowInput) => ({
      ...input,
      status: "submitted",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:00.000Z",
    })
  );
  start.mockRejectedValue(new Error("workflow failed"));
  markRegistrationSubmissionIncomplete.mockRejectedValue(
    new Error("store failed")
  );

  const { registrationApplication } = await loadApplication();

  await expect(
    registrationApplication.submitRegistration(registrationInput)
  ).rejects.toMatchObject({
    name: "RegistrationStoreError",
    operation: "mark_registration_submission_incomplete",
  });
});

test.each([
  ["submitted", "approval_not_ready"],
  ["submission_incomplete", "registration_submission_incomplete"],
] as const)("decideRegistration returns %s conflict reason for non-decidable registrations", async (status, reason) => {
  const record = createRegistrationRecord(status);
  getRegistrationRecord.mockResolvedValue(record);

  const { registrationApplication } = await loadApplication();
  const result = await registrationApplication.decideRegistration({
    registrationId: record.registrationId,
    decision: "approved",
    ...adminActor,
  });

  expect(result.isErr()).toBe(true);
  expect(getConflictReason(result)).toBe(reason);
  expect(markRegistrationApprovalProcessing).not.toHaveBeenCalled();
  expect(resumeHook).not.toHaveBeenCalled();
});

test("decideRegistration persists approval processing before resuming the workflow", async () => {
  const record = createRegistrationRecord("awaiting_approval");
  const decision: RegistrationApprovalDecision = {
    decision: "approved",
    reason: "Looks good",
    ...adminActor,
  };
  getRegistrationRecord.mockResolvedValue(record);
  markRegistrationApprovalProcessing.mockImplementation(
    async (
      registrationId: string,
      approval: RegistrationApprovalDecision
    ): Promise<RegistrationRecord> => ({
      ...record,
      registrationId,
      approvalDecision: approval.decision,
      approvalReason: approval.reason,
      actorEmail: approval.actorEmail,
      status: "approval_processing",
      updatedAt: "2026-03-22T00:00:01.000Z",
    })
  );
  resumeHook.mockResolvedValue(undefined);

  const { registrationApplication } = await loadApplication();
  const result = await registrationApplication.decideRegistration({
    registrationId: record.registrationId,
    ...decision,
  });

  expect(markRegistrationApprovalProcessing).toHaveBeenCalledWith(
    record.registrationId,
    decision
  );
  expect(resumeHook).toHaveBeenCalledWith(
    getRegistrationApprovalHookToken(record.registrationId),
    {
      ...decision,
    }
  );
  expect(
    markRegistrationApprovalProcessing.mock.invocationCallOrder[0] as number
  ).toBeLessThan(resumeHook.mock.invocationCallOrder[0] as number);
  expect(result.isOk()).toBe(true);

  if (result.isOk()) {
    expect(result.value).toEqual({
      registrationId: record.registrationId,
      status: "approval_processing",
    });
  }
});

test("decideRegistration treats a lost approval-processing lock write as idempotent for the same decision", async () => {
  const record = createRegistrationRecord("awaiting_approval");
  const processingRecord: RegistrationRecord = {
    ...record,
    status: "approval_processing",
    approvalDecision: "approved",
  };
  getRegistrationRecord
    .mockResolvedValueOnce(record)
    .mockResolvedValueOnce(processingRecord);
  markRegistrationApprovalProcessing.mockRejectedValue(
    new RegistrationStoreError({
      operation: "mark_registration_approval_processing",
      cause: new Error("Concurrent modification"),
    })
  );

  const { registrationApplication } = await loadApplication();
  const result = await registrationApplication.decideRegistration({
    registrationId: record.registrationId,
    decision: "approved",
    ...adminActor,
  });

  expect(result.isOk()).toBe(true);

  if (result.isOk()) {
    expect(result.value).toEqual({
      registrationId: record.registrationId,
      status: "approval_processing",
      idempotent: true,
    });
  }

  expect(resumeHook).not.toHaveBeenCalled();
});

test("decideRegistration returns a conflict when a lost approval-processing lock write finds an opposite decision", async () => {
  const record = createRegistrationRecord("awaiting_approval");
  const processingRecord: RegistrationRecord = {
    ...record,
    status: "approval_processing",
    approvalDecision: "rejected",
  };
  getRegistrationRecord
    .mockResolvedValueOnce(record)
    .mockResolvedValueOnce(processingRecord);
  markRegistrationApprovalProcessing.mockRejectedValue(
    new RegistrationStoreError({
      operation: "mark_registration_approval_processing",
      cause: new Error("Concurrent modification"),
    })
  );

  const { registrationApplication } = await loadApplication();
  const result = await registrationApplication.decideRegistration({
    registrationId: record.registrationId,
    decision: "approved",
    ...adminActor,
  });

  expect(result.isErr()).toBe(true);
  expect(getConflictReason(result)).toBe("decision_already_in_progress");
  expect(resumeHook).not.toHaveBeenCalled();
});

test.each([
  ["approval_processing", "approved", "approved", "approval_processing"],
  ["approved", "approved", "approved", "approved"],
  ["rejected", "rejected", "rejected", "rejected"],
] as const)("decideRegistration returns idempotent success for repeated %s %s decisions", async (status, storedDecision, requestedDecision, expectedStatus) => {
  const record = createRegistrationRecord(status, {
    approvalDecision: storedDecision,
  });
  getRegistrationRecord.mockResolvedValue(record);

  const { registrationApplication } = await loadApplication();
  const result = await registrationApplication.decideRegistration({
    registrationId: record.registrationId,
    decision: requestedDecision,
    ...adminActor,
  });

  expect(result.isOk()).toBe(true);

  if (result.isOk()) {
    expect(result.value).toEqual({
      registrationId: record.registrationId,
      status: expectedStatus,
      idempotent: true,
    });
  }

  expect(markRegistrationApprovalProcessing).not.toHaveBeenCalled();
  expect(resumeHook).not.toHaveBeenCalled();
});

test.each([
  [
    "approval_processing",
    "approved",
    "rejected",
    "decision_already_in_progress",
  ],
  [
    "approved",
    "approved",
    "rejected",
    "approved_registration_cannot_be_rejected",
  ],
  [
    "rejected",
    "rejected",
    "approved",
    "rejected_registration_cannot_be_approved",
  ],
] as const)("decideRegistration returns precise conflicts for opposite %s decisions", async (status, storedDecision, requestedDecision, reason) => {
  const record = createRegistrationRecord(status, {
    approvalDecision: storedDecision,
  });
  getRegistrationRecord.mockResolvedValue(record);

  const { registrationApplication } = await loadApplication();
  const result = await registrationApplication.decideRegistration({
    registrationId: record.registrationId,
    decision: requestedDecision,
    ...adminActor,
  });

  expect(result.isErr()).toBe(true);
  expect(getConflictReason(result)).toBe(reason);
  expect(markRegistrationApprovalProcessing).not.toHaveBeenCalled();
  expect(resumeHook).not.toHaveBeenCalled();
});

test("decideRegistration panics when an approval processing registration has no stored decision", async () => {
  const record = createRegistrationRecord("approval_processing");
  getRegistrationRecord.mockResolvedValue(record);

  const { registrationApplication } = await loadApplication();

  await expect(
    registrationApplication.decideRegistration({
      registrationId: record.registrationId,
      decision: "approved",
      ...adminActor,
    })
  ).rejects.toThrow("Approval processing registration is missing decision");
});
