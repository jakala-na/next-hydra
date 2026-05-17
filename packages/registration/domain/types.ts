export const REGION_REQUIRED_COUNTRY_CODES = ["US", "CA"] as const;

export const REGISTRATION_FIELD_LIMITS = {
  companyName: 120,
  companyPhone: 32,
  vatId: 64,
  contactName: 80,
  approvalReason: 500,
  actorName: 120,
  listLimit: 100,
} as const;

export const requiresRegion = (country: string) =>
  REGION_REQUIRED_COUNTRY_CODES.includes(
    country.toUpperCase() as (typeof REGION_REQUIRED_COUNTRY_CODES)[number]
  );

export type CompanyAddress = {
  streetName: string;
  additionalStreetInfo: string;
  postalCode: string;
  city: string;
  region: string;
  country: string;
};

export type RegistrationInput = {
  companyName: string;
  companyPhone: string;
  vatId: string;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  address: CompanyAddress;
};

export type RegistrationWorkflowInput = RegistrationInput & {
  registrationId: string;
};

export type RegistrationApprovalDecision = {
  decision: "approved" | "rejected";
  reason?: string;
  actorEmail: string;
  actorName: string;
};

export type RegistrationStatus =
  | "submitted"
  | "awaiting_approval"
  | "approval_processing"
  | "submission_incomplete"
  | "approved"
  | "rejected";

export type InvitationState = "pending" | "accepted" | "revoked";

export type RegistrationRecord = RegistrationWorkflowInput & {
  status: RegistrationStatus;
  userId?: string;
  authEmail?: string;
  authFirstName?: string;
  authLastName?: string;
  invitationId?: string;
  invitationState?: InvitationState;
  invitationCreatedAt?: string;
  invitationAcceptedAt?: string;
  identityLinkedAt?: string;
  customerId?: string;
  customerKey?: string;
  businessUnitId?: string;
  businessUnitKey?: string;
  hookToken?: string;
  createdAt: string;
  updatedAt: string;
  approvedAt?: string;
  rejectedAt?: string;
  approvalDecision?: RegistrationApprovalDecision["decision"];
  approvalReason?: string;
  actorEmail?: string;
  actorName?: string;
  decisionSubmittedAt?: string;
};

export type VersionedRegistrationRecord = {
  record: RegistrationRecord;
  version: number;
};

export type RegistrationDetail = Omit<
  RegistrationRecord,
  | "hookToken"
  | "customerId"
  | "customerKey"
  | "businessUnitId"
  | "businessUnitKey"
>;

export const toRegistrationDetail = (
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

  return detail;
};

export type StartRegistrationResult = {
  registrationId: string;
  runId: string;
  status: "submitted";
};

export type GetRegistrationInput = {
  registrationId: string;
};

export type ListRegistrationsInput = {
  status?: RegistrationStatus;
  search?: string;
  cursor?: string;
  limit?: number;
};

export type ListRegistrationsResult = {
  items: RegistrationDetail[];
  nextCursor?: string;
};

export type DecideRegistrationInput = RegistrationApprovalDecision & {
  registrationId: string;
};

export type DecideRegistrationResult = {
  registrationId: string;
  status: "approval_processing" | "approved" | "rejected";
  idempotent?: boolean;
};
