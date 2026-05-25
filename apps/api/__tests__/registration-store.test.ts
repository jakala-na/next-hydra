import type { RegistrationRecord } from "@repo/registration/domain/types";
import { beforeEach, expect, test, vi } from "vitest";

const getExecute = vi.fn();
const postExecute = vi.fn();
const lockPostExecute = vi.fn();
const post = vi.fn(() => ({ execute: postExecute }));
const lockPost = vi.fn(() => ({ execute: lockPostExecute }));
const get = vi.fn(() => ({ execute: getExecute }));
const withContainerAndKey = vi.fn(() => ({ get }));
const withContainer = vi.fn(() => ({ get, post }));
const customObjects = vi.fn(() => ({
  post,
  withContainer,
  withContainerAndKey,
}));
const lockCustomObjects = vi.fn(() => ({
  post: lockPost,
}));

vi.mock("../../../packages/commerce/lib/client/api-root", () => ({
  apiRoot: {
    customObjects,
  },
  apiRootWithoutConcurrentModificationRetry: {
    customObjects: lockCustomObjects,
  },
}));

const submittedRegistration: RegistrationRecord = {
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
  status: "submitted",
  createdAt: "2026-03-22T00:00:00.000Z",
  updatedAt: "2026-03-22T00:00:00.000Z",
};

const loadStore = async () =>
  vi.importActual<
    typeof import("../../../packages/commerce/lib/b2b-registration/service")
  >("../../../packages/commerce/lib/b2b-registration/service");

beforeEach(() => {
  vi.resetModules();
  getExecute.mockReset();
  postExecute.mockReset();
  lockPostExecute.mockReset();
  post.mockClear();
  lockPost.mockClear();
  get.mockClear();
  withContainer.mockClear();
  withContainerAndKey.mockClear();
  customObjects.mockClear();
  lockCustomObjects.mockClear();
});

test("marking a registration awaiting approval uses a versioned write", async () => {
  getExecute.mockResolvedValue({
    body: {
      value: submittedRegistration,
      version: 3,
    },
  });
  lockPostExecute.mockResolvedValue({});

  const { markRegistrationAwaitingApproval } = await loadStore();
  const record = await markRegistrationAwaitingApproval(
    submittedRegistration.registrationId
  );

  expect(record).toMatchObject({
    registrationId: submittedRegistration.registrationId,
    status: "awaiting_approval",
  });
  expect(lockPost).toHaveBeenCalledWith({
    body: {
      container: "b2b-registration-by-id",
      key: submittedRegistration.registrationId,
      version: 3,
      value: expect.objectContaining({
        status: "awaiting_approval",
      }),
    },
  });
});

test("marking approval processing uses a versioned write without concurrent modification retry", async () => {
  const awaitingApprovalRegistration: RegistrationRecord = {
    ...submittedRegistration,
    status: "awaiting_approval",
  };

  getExecute.mockResolvedValue({
    body: {
      version: 7,
      value: awaitingApprovalRegistration,
    },
  });
  lockPostExecute.mockResolvedValue({});

  const { markRegistrationApprovalProcessing } = await loadStore();
  const record = await markRegistrationApprovalProcessing(
    awaitingApprovalRegistration.registrationId,
    {
      decision: "approved",
      reason: "Looks good",
      actorEmail: "admin@example.com",
      actorName: "Ava Admin",
    }
  );

  expect(record).toMatchObject({
    approvalDecision: "approved",
    approvalReason: "Looks good",
    actorEmail: "admin@example.com",
    actorName: "Ava Admin",
    status: "approval_processing",
  });
  expect(lockPost).toHaveBeenCalledWith({
    body: {
      container: "b2b-registration-by-id",
      key: awaitingApprovalRegistration.registrationId,
      version: 7,
      value: expect.objectContaining({
        approvalDecision: "approved",
        decisionSubmittedAt: expect.any(String),
        status: "approval_processing",
      }),
    },
  });
  expect(post).not.toHaveBeenCalled();
});

test("updating a registration record requires a version", async () => {
  const { updateRegistrationRecord } = await loadStore();

  await expect(
    updateRegistrationRecord({
      record: submittedRegistration,
      version: 0,
    })
  ).rejects.toThrow("Registration record update requires a version");
  expect(lockPost).not.toHaveBeenCalled();
});

test("updating a registration record rejects fields outside the schema before writing", async () => {
  const { updateRegistrationRecord } = await loadStore();

  await expect(
    updateRegistrationRecord({
      record: {
        ...submittedRegistration,
        version: 3,
      } as unknown as RegistrationRecord,
      version: 3,
    })
  ).rejects.toThrow();
  expect(lockPost).not.toHaveBeenCalled();
});

test("reading a registration record rejects stored values outside the schema", async () => {
  getExecute.mockResolvedValue({
    body: {
      value: {
        ...submittedRegistration,
        version: 3,
      },
      version: 3,
    },
  });

  const { markRegistrationAwaitingApproval } = await loadStore();

  await expect(
    markRegistrationAwaitingApproval(submittedRegistration.registrationId)
  ).rejects.toThrow();
  expect(lockPost).not.toHaveBeenCalled();
});

test("listing registration records ignores invalid stored values", async () => {
  const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);

  getExecute.mockResolvedValue({
    body: {
      results: [
        {
          container: "b2b-registration-by-id",
          key: "legacy-registration",
          id: "custom-object-id",
          version: 1,
          value: {
            ...submittedRegistration,
            status: "pending",
          },
        },
        {
          container: "b2b-registration-by-id",
          key: submittedRegistration.registrationId,
          id: "valid-custom-object-id",
          version: 2,
          value: submittedRegistration,
        },
      ],
    },
  });

  const { listRegistrationRecords } = await loadStore();
  const records = await listRegistrationRecords();

  expect(records).toEqual([submittedRegistration]);
  expect(warn).toHaveBeenCalledWith(
    "Ignoring invalid registration record in list query",
    expect.objectContaining({
      key: "legacy-registration",
      issues: expect.arrayContaining([
        expect.objectContaining({
          path: ["status"],
        }),
      ]),
    })
  );

  warn.mockRestore();
});
