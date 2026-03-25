import type { RegistrationWorkflowInput } from "@repo/registration/domain/types";
import { beforeEach, expect, test, vi } from "vitest";

const createPendingRegistrationRecord = vi.fn();
const getRegistrationRecord = vi.fn();
const listRegistrationRecords = vi.fn();
const markRegistrationWorkflowStartFailed = vi.fn();
const start = vi.fn();
const resumeHook = vi.fn();
const registerCompanyWorkflow = vi.fn();

vi.mock("@repo/commerce/lib/b2b-registration/service", () => ({
  createPendingRegistrationRecord,
  getRegistrationRecord,
  listRegistrationRecords,
  markRegistrationWorkflowStartFailed,
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
  contactFirstName: "Ava",
  contactLastName: "Stone",
  email: "ava@example.com",
  address: {
    streetName: "Canal Street",
    postalCode: "10013",
    city: "New York",
    region: "NY",
    country: "US",
  },
};

beforeEach(() => {
  vi.resetModules();
  createPendingRegistrationRecord.mockReset();
  getRegistrationRecord.mockReset();
  listRegistrationRecords.mockReset();
  markRegistrationWorkflowStartFailed.mockReset();
  start.mockReset();
  resumeHook.mockReset();
  registerCompanyWorkflow.mockReset();
});

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

test("getRegistration wraps store exceptions in RegistrationStoreError", async () => {
  getRegistrationRecord.mockRejectedValue(new Error("store read failed"));

  const { registrationApplication } = await loadApplication();
  const result = await registrationApplication.getRegistration({
    registrationId: crypto.randomUUID(),
  });

  expect(result.isErr()).toBe(true);

  if (result.isErr()) {
    if (result.error.name !== "RegistrationStoreError") {
      throw result.error;
    }

    const error = result.error as { cause: unknown; operation: string };
    expect(error.operation).toBe("get_registration_record");
    expect(error.cause).toBeInstanceOf(Error);
    expect((error.cause as Error).message).toBe("store read failed");
  }
});

test("submitRegistration preserves typed workflow start failures", async () => {
  createPendingRegistrationRecord.mockImplementation(
    async (input: RegistrationWorkflowInput) => ({
      ...input,
      status: "pending",
      createdAt: "2026-03-22T00:00:00.000Z",
      updatedAt: "2026-03-22T00:00:00.000Z",
    })
  );
  start.mockRejectedValue(new Error("workflow failed"));
  markRegistrationWorkflowStartFailed.mockRejectedValue(
    new Error("compensation failed")
  );

  const { registrationApplication } = await loadApplication();
  const result =
    await registrationApplication.submitRegistration(registrationInput);

  expect(start).toHaveBeenCalledOnce();
  expect(markRegistrationWorkflowStartFailed).toHaveBeenCalledWith(
    expect.objectContaining({
      ...registrationInput,
      registrationId: expect.any(String),
    }),
    "gate.failed.description"
  );
  expect(result.isErr()).toBe(true);

  if (result.isErr()) {
    if (result.error.name !== "RegistrationSubmitFailedError") {
      throw result.error;
    }

    const error = result.error as {
      cause: unknown;
      compensationCause?: unknown;
      reason: string;
    };
    expect(error.reason).toBe("workflow_start_failed");
    expect(error.cause).toBeInstanceOf(Error);
    expect((error.cause as Error).message).toBe("workflow failed");
    expect(error.compensationCause).toBeInstanceOf(Error);
    expect((error.compensationCause as Error).message).toBe(
      "compensation failed"
    );
  }
});
