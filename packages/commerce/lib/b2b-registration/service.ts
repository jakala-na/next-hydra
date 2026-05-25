import type {
  BusinessUnit,
  BusinessUnitDraft,
  Customer,
  CustomerDraft,
  CustomerUpdateAction,
  CustomObject,
} from "@commercetools/platform-sdk";
import { log } from "@repo/observability/log";
import { registrationRecordSchema } from "@repo/registration/domain/schemas";
import type {
  InvitationState,
  RegistrationApprovalDecision,
  RegistrationRecord,
  RegistrationWorkflowInput,
  VersionedRegistrationRecord,
} from "@repo/registration/domain/types";
import { z } from "zod";
import {
  apiRoot,
  apiRootWithoutConcurrentModificationRetry,
} from "../client/api-root";

const ISO_NOW = () => new Date().toISOString();

const createCustomerKey = (registrationId: string) =>
  `registration-customer-${registrationId}`;

const createBusinessUnitKey = (registrationId: string) =>
  `registration-business-unit-${registrationId}`;

const REGISTRATION_BY_ID_CONTAINER = "b2b-registration-by-id";
const NOT_FOUND_STATUS_CODE = 404;
const commercetoolsStatusCodeErrorSchema = z
  .object({
    statusCode: z.number(),
  })
  .passthrough();

const toVersionedRegistrationRecord = (
  customObject: CustomObject
): VersionedRegistrationRecord => ({
  record: registrationRecordSchema.parse(customObject.value),
  version: customObject.version,
});

export const shouldIgnoreInvitationRevocation = (
  record: Pick<RegistrationRecord, "userId" | "authEmail" | "invitationState">
) =>
  Boolean(
    record.userId || record.authEmail || record.invitationState === "accepted"
  );

const isNotFoundError = (error: unknown) =>
  commercetoolsStatusCodeErrorSchema.safeParse(error).data?.statusCode ===
  NOT_FOUND_STATUS_CODE;

async function getCustomObject(
  container: string,
  key: string
): Promise<CustomObject | null> {
  try {
    const response = await apiRoot
      .customObjects()
      .withContainerAndKey({ container, key })
      .get()
      .execute();
    return response.body;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

const getRegistrationRecordParseMetadata = (customObject: CustomObject) => ({
  container: customObject.container,
  key: customObject.key,
  id: customObject.id,
  version: customObject.version,
});

async function queryRegistrationRecord(
  where: string
): Promise<RegistrationRecord | null> {
  const records = await queryRegistrationRecords(where, 1);
  return records[0] ?? null;
}

async function queryVersionedRegistrationRecord(
  where: string
): Promise<VersionedRegistrationRecord | null> {
  const response = await apiRoot
    .customObjects()
    .withContainer({ container: REGISTRATION_BY_ID_CONTAINER })
    .get({
      queryArgs: {
        limit: 1,
        where,
        withTotal: false,
      },
    })
    .execute();
  const customObject = response.body.results[0];

  if (!customObject) {
    return null;
  }

  return toVersionedRegistrationRecord(customObject);
}

async function queryRegistrationRecords(
  where?: string,
  limit = 20
): Promise<RegistrationRecord[]> {
  const response = await apiRoot
    .customObjects()
    .withContainer({ container: REGISTRATION_BY_ID_CONTAINER })
    .get({
      queryArgs: {
        limit,
        withTotal: false,
        ...(where ? { where } : {}),
      },
    })
    .execute();

  const records: RegistrationRecord[] = [];

  for (const result of response.body.results) {
    const parsed = registrationRecordSchema.safeParse(result.value);

    if (parsed.success) {
      records.push(parsed.data);
      continue;
    }

    log.warn("Ignoring invalid registration record in list query", {
      ...getRegistrationRecordParseMetadata(result),
      issues: parsed.error.issues.map((issue) => ({
        path: issue.path,
        code: issue.code,
        message: issue.message,
      })),
    });
  }

  return records.sort(
    (left, right) =>
      right.updatedAt.localeCompare(left.updatedAt) ||
      right.createdAt.localeCompare(left.createdAt)
  );
}

async function upsertCustomObject(
  container: string,
  key: string,
  value: unknown,
  options: {
    version?: number;
    retryOnConcurrentModification?: boolean;
  } = {}
): Promise<void> {
  const root =
    options.retryOnConcurrentModification === false
      ? apiRootWithoutConcurrentModificationRetry
      : apiRoot;

  await root
    .customObjects()
    .post({
      body: {
        container,
        key,
        ...(typeof options.version === "number"
          ? { version: options.version }
          : {}),
        value,
      },
    })
    .execute();
}

async function getCustomerByKey(key: string): Promise<Customer | null> {
  try {
    const response = await apiRoot.customers().withKey({ key }).get().execute();
    return response.body;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

async function getBusinessUnitByKey(key: string): Promise<BusinessUnit | null> {
  try {
    const response = await apiRoot
      .businessUnits()
      .withKey({ key })
      .get()
      .execute();
    return response.body;
  } catch (error) {
    if (isNotFoundError(error)) {
      return null;
    }

    throw error;
  }
}

async function saveRegistrationRecord(
  record: RegistrationRecord
): Promise<void> {
  const value = registrationRecordSchema.parse(record);

  await upsertCustomObject(
    REGISTRATION_BY_ID_CONTAINER,
    value.registrationId,
    value
  );
}

export async function updateRegistrationRecord(
  versionedRecord: VersionedRegistrationRecord
): Promise<RegistrationRecord> {
  if (
    !Number.isInteger(versionedRecord.version) ||
    versionedRecord.version < 1
  ) {
    throw new Error("Registration record update requires a version");
  }

  const value = registrationRecordSchema.parse(versionedRecord.record);

  await upsertCustomObject(
    REGISTRATION_BY_ID_CONTAINER,
    value.registrationId,
    value,
    {
      retryOnConcurrentModification: false,
      version: versionedRecord.version,
    }
  );

  return value;
}

async function getVersionedRegistrationRecord(
  registrationId: string
): Promise<VersionedRegistrationRecord | null> {
  const customObject = await getCustomObject(
    REGISTRATION_BY_ID_CONTAINER,
    registrationId
  );

  if (!customObject) {
    return null;
  }

  return toVersionedRegistrationRecord(customObject);
}

export async function getRegistrationRecord(
  registrationId: string
): Promise<RegistrationRecord | null> {
  const customObject = await getCustomObject(
    REGISTRATION_BY_ID_CONTAINER,
    registrationId
  );

  return customObject
    ? registrationRecordSchema.parse(customObject.value)
    : null;
}

export function getRegistrationRecordByUserId(
  userId: string
): Promise<RegistrationRecord | null> {
  return queryRegistrationRecord(`value(userId = ${JSON.stringify(userId)})`);
}

export function getRegistrationRecordByInvitationId(
  invitationId: string
): Promise<RegistrationRecord | null> {
  return queryRegistrationRecord(
    `value(invitationId = ${JSON.stringify(invitationId)})`
  );
}

export async function getLatestRegistrationRecordByAuthEmail(
  email: string
): Promise<RegistrationRecord | null> {
  const records = await queryRegistrationRecords(
    `value(authEmail = ${JSON.stringify(email)})`
  );
  return records[0] ?? null;
}

export function listRegistrationRecords(
  limit = 100
): Promise<RegistrationRecord[]> {
  return queryRegistrationRecords(undefined, limit);
}

export async function markRegistrationSubmissionIncomplete(
  input: RegistrationWorkflowInput
): Promise<RegistrationRecord> {
  const record = await getVersionedRegistrationRecord(input.registrationId);

  if (!record) {
    throw new Error(`Registration ${input.registrationId} not found`);
  }

  const now = ISO_NOW();
  return updateRegistrationRecord({
    record: {
      ...record.record,
      ...input,
      status: "submission_incomplete",
      updatedAt: now,
    },
    version: record.version,
  });
}

export async function createPendingRegistrationRecord(
  input: RegistrationWorkflowInput
): Promise<RegistrationRecord> {
  const existing = await getRegistrationRecord(input.registrationId);

  if (existing) {
    return existing;
  }

  const now = ISO_NOW();
  const record: RegistrationRecord = {
    ...input,
    status: "submitted",
    createdAt: now,
    updatedAt: now,
  };

  await saveRegistrationRecord(record);

  return record;
}

export async function createPendingCustomerAndBusinessUnit(
  input: RegistrationWorkflowInput
): Promise<RegistrationRecord> {
  const existingRecord = await getVersionedRegistrationRecord(
    input.registrationId
  );
  const customerKey =
    existingRecord?.record.customerKey ??
    createCustomerKey(input.registrationId);
  const businessUnitKey =
    existingRecord?.record.businessUnitKey ??
    createBusinessUnitKey(input.registrationId);

  let customer = await getCustomerByKey(customerKey);

  if (!customer) {
    const customerDraft: CustomerDraft = {
      key: customerKey,
      authenticationMode: "ExternalAuth",
      email: input.email,
      firstName: input.contactFirstName,
      lastName: input.contactLastName,
      companyName: input.companyName,
      vatId: input.vatId,
      addresses: [
        {
          ...input.address,
          firstName: input.contactFirstName,
          lastName: input.contactLastName,
          company: input.companyName,
          phone: input.companyPhone,
        },
      ],
      defaultBillingAddress: 0,
      defaultShippingAddress: 0,
      billingAddresses: [0],
      shippingAddresses: [0],
      isEmailVerified: true,
    };

    const createdCustomerResponse = await apiRoot
      .customers()
      .post({ body: customerDraft })
      .execute();
    customer = createdCustomerResponse.body.customer;
  }

  let businessUnit = await getBusinessUnitByKey(businessUnitKey);

  if (!businessUnit) {
    const businessUnitDraft: BusinessUnitDraft = {
      key: businessUnitKey,
      unitType: "Company",
      status: "Inactive",
      name: input.companyName,
      contactEmail: input.email,
      addresses: [
        {
          ...input.address,
          firstName: input.contactFirstName,
          lastName: input.contactLastName,
          company: input.companyName,
          phone: input.companyPhone,
        },
      ],
      billingAddresses: [0],
      shippingAddresses: [0],
      defaultBillingAddress: 0,
      defaultShippingAddress: 0,
    };

    const businessUnitResponse = await apiRoot
      .businessUnits()
      .post({ body: businessUnitDraft })
      .execute();
    businessUnit = businessUnitResponse.body;
  }

  const now = ISO_NOW();
  const record: RegistrationRecord = {
    ...(existingRecord?.record ?? {
      ...input,
      createdAt: now,
    }),
    ...input,
    status: existingRecord?.record.status ?? "submitted",
    customerId: customer.id,
    customerKey,
    businessUnitId: businessUnit.id,
    businessUnitKey,
    updatedAt: now,
    userId: existingRecord?.record.userId,
    authEmail: existingRecord?.record.authEmail,
    authFirstName: existingRecord?.record.authFirstName,
    authLastName: existingRecord?.record.authLastName,
    invitationId: existingRecord?.record.invitationId,
    invitationState: existingRecord?.record.invitationState,
    invitationCreatedAt: existingRecord?.record.invitationCreatedAt,
    invitationAcceptedAt: existingRecord?.record.invitationAcceptedAt,
    identityLinkedAt: existingRecord?.record.identityLinkedAt,
    approvedAt: existingRecord?.record.approvedAt,
    rejectedAt: existingRecord?.record.rejectedAt,
    approvalDecision: existingRecord?.record.approvalDecision,
    approvalReason: existingRecord?.record.approvalReason,
    actorEmail: existingRecord?.record.actorEmail,
    actorName: existingRecord?.record.actorName,
    decisionSubmittedAt: existingRecord?.record.decisionSubmittedAt,
  };

  if (existingRecord) {
    return updateRegistrationRecord({
      record,
      version: existingRecord.version,
    });
  }

  await saveRegistrationRecord(record);

  return record;
}

export async function markRegistrationAwaitingApproval(
  registrationId: string
): Promise<RegistrationRecord> {
  const record = await getVersionedRegistrationRecord(registrationId);

  if (!record) {
    throw new Error(`Registration ${registrationId} not found`);
  }

  return updateRegistrationRecord({
    record: {
      ...record.record,
      status: "awaiting_approval",
      updatedAt: ISO_NOW(),
    },
    version: record.version,
  });
}

export async function saveRegistrationInvitation(
  registrationId: string,
  invitation: {
    id: string;
    state?: InvitationState;
  }
): Promise<RegistrationRecord> {
  const record = await getVersionedRegistrationRecord(registrationId);

  if (!record) {
    throw new Error(`Registration ${registrationId} not found`);
  }

  const now = ISO_NOW();
  return updateRegistrationRecord({
    record: {
      ...record.record,
      invitationId: invitation.id,
      invitationState: invitation.state ?? "pending",
      invitationCreatedAt: record.record.invitationCreatedAt ?? now,
      updatedAt: now,
    },
    version: record.version,
  });
}

export async function markRegistrationApprovalProcessing(
  registrationId: string,
  approval: RegistrationApprovalDecision
): Promise<RegistrationRecord> {
  const record = await getVersionedRegistrationRecord(registrationId);

  if (!record) {
    throw new Error(`Registration ${registrationId} not found`);
  }

  const now = ISO_NOW();
  return updateRegistrationRecord({
    record: {
      ...record.record,
      status: "approval_processing",
      approvalDecision: approval.decision,
      approvalReason: approval.reason,
      actorEmail: approval.actorEmail,
      actorName: approval.actorName,
      decisionSubmittedAt: now,
      updatedAt: now,
    },
    version: record.version,
  });
}

async function syncCustomerIdentity(
  record: RegistrationRecord,
  identity: {
    userId: string;
    email: string;
    firstName?: string;
    lastName?: string;
  }
): Promise<void> {
  if (!record.customerId) {
    return;
  }

  const customerResponse = await apiRoot
    .customers()
    .withId({ ID: record.customerId })
    .get()
    .execute();
  const customer = customerResponse.body;
  const actions: CustomerUpdateAction[] = [];

  if (customer.externalId !== identity.userId) {
    actions.push({
      action: "setExternalId",
      externalId: identity.userId,
    });
  }

  if (customer.email !== identity.email) {
    actions.push({
      action: "changeEmail",
      email: identity.email,
    });
  }

  if (identity.firstName && customer.firstName !== identity.firstName) {
    actions.push({
      action: "setFirstName",
      firstName: identity.firstName,
    });
  }

  if (identity.lastName && customer.lastName !== identity.lastName) {
    actions.push({
      action: "setLastName",
      lastName: identity.lastName,
    });
  }

  if (actions.length === 0) {
    return;
  }

  await apiRoot
    .customers()
    .withId({ ID: record.customerId })
    .post({
      body: {
        version: customer.version,
        actions,
      },
    })
    .execute();
}

export async function syncRegistrationIdentityFromInvitation(
  invitationId: string,
  identity: {
    userId: string;
    email: string;
    firstName?: string;
    lastName?: string;
  }
): Promise<RegistrationRecord | null> {
  const record = await queryVersionedRegistrationRecord(
    `value(invitationId = ${JSON.stringify(invitationId)})`
  );

  if (!record) {
    return null;
  }

  await syncCustomerIdentity(record.record, identity);

  const now = ISO_NOW();
  return updateRegistrationRecord({
    record: {
      ...record.record,
      userId: identity.userId,
      authEmail: identity.email,
      authFirstName: identity.firstName ?? record.record.authFirstName,
      authLastName: identity.lastName ?? record.record.authLastName,
      invitationState: "accepted",
      invitationAcceptedAt: record.record.invitationAcceptedAt ?? now,
      identityLinkedAt: now,
      updatedAt: now,
    },
    version: record.version,
  });
}

export async function markRegistrationInvitationRevoked(
  invitationId: string
): Promise<RegistrationRecord | null> {
  const record = await queryVersionedRegistrationRecord(
    `value(invitationId = ${JSON.stringify(invitationId)})`
  );

  if (!record) {
    return null;
  }

  if (shouldIgnoreInvitationRevocation(record.record)) {
    log.error(
      "Received invitation.revoked for an already linked registration",
      {
        registrationId: record.record.registrationId,
        invitationId,
        userId: record.record.userId,
        authEmail: record.record.authEmail,
        invitationState: record.record.invitationState,
      }
    );
    return record.record;
  }

  if (record.record.invitationState === "revoked") {
    return record.record;
  }

  return updateRegistrationRecord({
    record: {
      ...record.record,
      invitationState: "revoked",
      updatedAt: ISO_NOW(),
    },
    version: record.version,
  });
}

export async function updateRegistrationApprovalStatus(
  registrationId: string,
  approval: RegistrationApprovalDecision
): Promise<RegistrationRecord> {
  const record = await getVersionedRegistrationRecord(registrationId);

  if (!record) {
    throw new Error(`Registration ${registrationId} not found`);
  }

  if (
    record.record.status === "approved" ||
    record.record.status === "rejected"
  ) {
    return record.record;
  }

  const now = ISO_NOW();
  let nextRecord: VersionedRegistrationRecord = {
    record: {
      ...record.record,
      status: approval.decision,
      updatedAt: now,
      approvalDecision: approval.decision,
      approvalReason: approval.reason,
      actorEmail: approval.actorEmail,
      actorName: approval.actorName,
      decisionSubmittedAt: record.record.decisionSubmittedAt,
    },
    version: record.version,
  };

  if (approval.decision === "approved") {
    if (!record.record.invitationId) {
      throw new Error(
        `Approved registration ${record.record.registrationId} is missing invitationId`
      );
    }

    nextRecord = {
      record: {
        ...nextRecord.record,
        approvedAt: now,
        rejectedAt: undefined,
      },
      version: nextRecord.version,
    };

    if (record.record.businessUnitId) {
      const businessUnitResponse = await apiRoot
        .businessUnits()
        .withId({ ID: record.record.businessUnitId })
        .get()
        .execute();

      await apiRoot
        .businessUnits()
        .withId({ ID: record.record.businessUnitId })
        .post({
          body: {
            version: businessUnitResponse.body.version,
            actions: [{ action: "changeStatus", status: "Active" }],
          },
        })
        .execute();
    }
  }

  if (approval.decision === "rejected") {
    nextRecord = {
      record: {
        ...nextRecord.record,
        rejectedAt: now,
        approvedAt: undefined,
      },
      version: nextRecord.version,
    };
  }

  return updateRegistrationRecord(nextRecord);
}
