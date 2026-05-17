import type { RegistrationRecord } from "@repo/registration/domain/types";
import { beforeEach, expect, test, vi } from "vitest";

const createPendingCustomerAndBusinessUnit = vi.fn();
const saveRegistrationHookToken = vi.fn();
const saveRegistrationInvitation = vi.fn();
const updateRegistrationApprovalStatus = vi.fn();
const sendAwaitingApprovalEmail = vi.fn();
const sendApprovedEmail = vi.fn();
const createWorkosInvitation = vi.fn();
const createHook = vi.fn();

vi.mock("@repo/commerce/lib/b2b-registration/service", () => ({
  createPendingCustomerAndBusinessUnit,
  saveRegistrationHookToken,
  saveRegistrationInvitation,
  updateRegistrationApprovalStatus,
}));

vi.mock("@repo/email/registration", () => ({
  sendApprovedEmail,
  sendAwaitingApprovalEmail,
}));

vi.mock("@repo/auth-workos/admin", () => ({
  createWorkosInvitation,
}));

vi.mock("workflow", () => ({
  createHook,
}));

const registrationInput = {
  registrationId: crypto.randomUUID(),
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

const loadWorkflow = async () => import("../workflows/register-company");

beforeEach(() => {
  vi.resetModules();
  createPendingCustomerAndBusinessUnit.mockReset();
  saveRegistrationHookToken.mockReset();
  saveRegistrationInvitation.mockReset();
  updateRegistrationApprovalStatus.mockReset();
  sendAwaitingApprovalEmail.mockReset();
  sendApprovedEmail.mockReset();
  createWorkosInvitation.mockReset();
  createHook.mockReset();
});

test("registration workflow sends awaiting approval email after hook token persistence", async () => {
  const hook = Object.assign(
    Promise.resolve({
      decision: "rejected" as const,
      reason: "Not eligible",
      actorEmail: "admin@example.com",
      actorName: "Ava Admin",
    }),
    { token: "hook_123" }
  );
  const rejectedRecord: RegistrationRecord = {
    ...registrationInput,
    status: "rejected",
    hookToken: "hook_123",
    approvalReason: "Not eligible",
    createdAt: "2026-03-22T00:00:00.000Z",
    updatedAt: "2026-03-22T00:00:01.000Z",
  };

  createHook.mockReturnValue(hook);
  updateRegistrationApprovalStatus.mockResolvedValue(rejectedRecord);

  const { registerCompanyWorkflow } = await loadWorkflow();
  await registerCompanyWorkflow(registrationInput);

  expect(saveRegistrationHookToken).toHaveBeenCalledWith(
    registrationInput.registrationId,
    "hook_123"
  );
  expect(sendAwaitingApprovalEmail).toHaveBeenCalledWith(registrationInput);
  const hookTokenPersistenceOrder =
    saveRegistrationHookToken.mock.invocationCallOrder[0];
  const awaitingApprovalEmailOrder =
    sendAwaitingApprovalEmail.mock.invocationCallOrder[0];

  expect(hookTokenPersistenceOrder).toBeDefined();
  expect(awaitingApprovalEmailOrder).toBeDefined();
  expect(hookTokenPersistenceOrder as number).toBeLessThan(
    awaitingApprovalEmailOrder as number
  );
});
