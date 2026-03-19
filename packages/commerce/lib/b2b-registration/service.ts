import type {
  BusinessUnit,
  BusinessUnitDraft,
  Customer,
  CustomerDraft,
  CustomerUpdateAction,
  CustomObject,
} from "@commercetools/platform-sdk";
import { log } from "@repo/observability/log";
import type {
  InvitationState,
  RegistrationApprovalDecision,
  RegistrationRecord,
  RegistrationWorkflowInput,
} from "@repo/registration/domain/types";
import { apiRoot } from "../client/api-root";

const ISO_NOW = () => new Date().toISOString();

const createCustomerKey = (registrationId: string) =>
  `registration-customer-${registrationId}`;

const createBusinessUnitKey = (registrationId: string) =>
  `registration-business-unit-${registrationId}`;

const REGISTRATION_BY_ID_CONTAINER = "b2b-registration-by-id";
const NOT_FOUND_STATUS_CODE = 404;

export const shouldIgnoreInvitationRevocation = (
  record: Pick<RegistrationRecord, "userId" | "authEmail" | "invitationState">
) =>
  Boolean(
    record.userId || record.authEmail || record.invitationState === "accepted"
  );

const isNotFoundError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "statusCode" in error &&
  error.statusCode === NOT_FOUND_STATUS_CODE;

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

async function queryRegistrationRecord(
  where: string
): Promise<RegistrationRecord | null> {
  const records = await queryRegistrationRecords(where, 1);
  return records[0] ?? null;
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

  return response.body.results
    .map((result) => result.value as RegistrationRecord)
    .sort(
      (left, right) =>
        right.updatedAt.localeCompare(left.updatedAt) ||
        right.createdAt.localeCompare(left.createdAt)
    );
}

async function upsertCustomObject(
  container: string,
  key: string,
  value: unknown
): Promise<void> {
  await apiRoot
    .customObjects()
    .post({
      body: {
        container,
        key,
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

export async function saveRegistrationRecord(
  record: RegistrationRecord
): Promise<void> {
  await upsertCustomObject(
    REGISTRATION_BY_ID_CONTAINER,
    record.registrationId,
    record
  );
}

export async function getRegistrationRecord(
  registrationId: string
): Promise<RegistrationRecord | null> {
  const customObject = await getCustomObject(
    REGISTRATION_BY_ID_CONTAINER,
    registrationId
  );

  return (customObject?.value as RegistrationRecord | undefined) ?? null;
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

export async function markRegistrationWorkflowStartFailed(
  input: RegistrationWorkflowInput,
  reason?: string
): Promise<RegistrationRecord> {
  const now = ISO_NOW();
  const record: RegistrationRecord = {
    ...input,
    status: "workflow_start_failed",
    createdAt: now,
    updatedAt: now,
    approvalReason: reason,
  };

  await saveRegistrationRecord(record);

  return record;
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
    status: "pending",
    createdAt: now,
    updatedAt: now,
  };

  await saveRegistrationRecord(record);

  return record;
}

export async function createPendingCustomerAndBusinessUnit(
  input: RegistrationWorkflowInput
): Promise<RegistrationRecord> {
  const existingRecord = await getRegistrationRecord(input.registrationId);
  const customerKey =
    existingRecord?.customerKey ?? createCustomerKey(input.registrationId);
  const businessUnitKey =
    existingRecord?.businessUnitKey ??
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
    ...(existingRecord ?? {
      ...input,
      createdAt: now,
    }),
    ...input,
    status: existingRecord?.status ?? "pending",
    customerId: customer.id,
    customerKey,
    businessUnitId: businessUnit.id,
    businessUnitKey,
    updatedAt: now,
    userId: existingRecord?.userId,
    authEmail: existingRecord?.authEmail,
    authFirstName: existingRecord?.authFirstName,
    authLastName: existingRecord?.authLastName,
    invitationId: existingRecord?.invitationId,
    invitationState: existingRecord?.invitationState,
    invitationCreatedAt: existingRecord?.invitationCreatedAt,
    invitationAcceptedAt: existingRecord?.invitationAcceptedAt,
    identityLinkedAt: existingRecord?.identityLinkedAt,
    hookToken: existingRecord?.hookToken,
    approvedAt: existingRecord?.approvedAt,
    rejectedAt: existingRecord?.rejectedAt,
    approvalReason: existingRecord?.approvalReason,
    actorEmail: existingRecord?.actorEmail,
    actorName: existingRecord?.actorName,
  };

  await saveRegistrationRecord(record);

  return record;
}

export async function saveRegistrationHookToken(
  registrationId: string,
  hookToken: string
): Promise<RegistrationRecord> {
  const record = await getRegistrationRecord(registrationId);

  if (!record) {
    throw new Error(`Registration ${registrationId} not found`);
  }

  const updatedRecord: RegistrationRecord = {
    ...record,
    hookToken,
    updatedAt: ISO_NOW(),
  };

  await saveRegistrationRecord(updatedRecord);

  return updatedRecord;
}

export async function saveRegistrationInvitation(
  registrationId: string,
  invitation: {
    id: string;
    state?: InvitationState;
  }
): Promise<RegistrationRecord> {
  const record = await getRegistrationRecord(registrationId);

  if (!record) {
    throw new Error(`Registration ${registrationId} not found`);
  }

  const now = ISO_NOW();
  const updatedRecord: RegistrationRecord = {
    ...record,
    invitationId: invitation.id,
    invitationState: invitation.state ?? "pending",
    invitationCreatedAt: record.invitationCreatedAt ?? now,
    updatedAt: now,
  };

  await saveRegistrationRecord(updatedRecord);

  return updatedRecord;
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

  if (
    typeof identity.firstName === "string" &&
    identity.firstName.length > 0 &&
    customer.firstName !== identity.firstName
  ) {
    actions.push({
      action: "setFirstName",
      firstName: identity.firstName,
    });
  }

  if (
    typeof identity.lastName === "string" &&
    identity.lastName.length > 0 &&
    customer.lastName !== identity.lastName
  ) {
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
  const record = await getRegistrationRecordByInvitationId(invitationId);

  if (!record) {
    return null;
  }

  await syncCustomerIdentity(record, identity);

  const now = ISO_NOW();
  const updatedRecord: RegistrationRecord = {
    ...record,
    userId: identity.userId,
    authEmail: identity.email,
    authFirstName: identity.firstName ?? record.authFirstName,
    authLastName: identity.lastName ?? record.authLastName,
    invitationState: "accepted",
    invitationAcceptedAt: record.invitationAcceptedAt ?? now,
    identityLinkedAt: now,
    updatedAt: now,
  };

  await saveRegistrationRecord(updatedRecord);

  return updatedRecord;
}

export async function markRegistrationInvitationRevoked(
  invitationId: string
): Promise<RegistrationRecord | null> {
  const record = await getRegistrationRecordByInvitationId(invitationId);

  if (!record) {
    return null;
  }

  if (shouldIgnoreInvitationRevocation(record)) {
    log.error(
      "Received invitation.revoked for an already linked registration",
      {
        registrationId: record.registrationId,
        invitationId,
        userId: record.userId,
        authEmail: record.authEmail,
        invitationState: record.invitationState,
      }
    );
    return record;
  }

  if (record.invitationState === "revoked") {
    return record;
  }

  const updatedRecord: RegistrationRecord = {
    ...record,
    invitationState: "revoked",
    updatedAt: ISO_NOW(),
  };

  await saveRegistrationRecord(updatedRecord);

  return updatedRecord;
}

export async function updateRegistrationApprovalStatus(
  registrationId: string,
  approval: RegistrationApprovalDecision
): Promise<RegistrationRecord> {
  const record = await getRegistrationRecord(registrationId);

  if (!record) {
    throw new Error(`Registration ${registrationId} not found`);
  }

  if (record.status === "approved" || record.status === "rejected") {
    return record;
  }

  const now = ISO_NOW();
  let nextRecord: RegistrationRecord = {
    ...record,
    status: approval.decision,
    updatedAt: now,
    approvalReason: approval.reason,
    actorEmail: approval.actorEmail,
    actorName: approval.actorName,
  };

  if (approval.decision === "approved") {
    if (!record.invitationId) {
      throw new Error(
        `Approved registration ${record.registrationId} is missing invitationId`
      );
    }

    nextRecord = {
      ...nextRecord,
      approvedAt: now,
      rejectedAt: undefined,
    };

    if (record.businessUnitId) {
      const businessUnitResponse = await apiRoot
        .businessUnits()
        .withId({ ID: record.businessUnitId })
        .get()
        .execute();

      await apiRoot
        .businessUnits()
        .withId({ ID: record.businessUnitId })
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
      ...nextRecord,
      rejectedAt: now,
      approvedAt: undefined,
    };
  }

  await saveRegistrationRecord(nextRecord);

  return nextRecord;
}
