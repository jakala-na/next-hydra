import { Schema } from "effect";

export const CommerceCustomerId = Schema.NonEmptyString.pipe(
  Schema.brand("CommerceCustomerId")
);
export type CommerceCustomerId = typeof CommerceCustomerId.Type;

export const CommerceBusinessUnitId = Schema.NonEmptyString.pipe(
  Schema.brand("CommerceBusinessUnitId")
);
export type CommerceBusinessUnitId = typeof CommerceBusinessUnitId.Type;

export const CommerceBusinessUnitKey = Schema.NonEmptyString.pipe(
  Schema.brand("CommerceBusinessUnitKey")
);
export type CommerceBusinessUnitKey = typeof CommerceBusinessUnitKey.Type;

export const CommerceBusinessUnitLabel = Schema.NonEmptyString.pipe(
  Schema.brand("CommerceBusinessUnitLabel")
);
export type CommerceBusinessUnitLabel = typeof CommerceBusinessUnitLabel.Type;

export class CommerceBusinessUnitMembership extends Schema.Class<CommerceBusinessUnitMembership>(
  "CommerceBusinessUnitMembership"
)({
  businessUnitId: CommerceBusinessUnitId,
  businessUnitKey: CommerceBusinessUnitKey,
  businessUnitLabel: CommerceBusinessUnitLabel,
}) {}

export class CommerceAccount extends Schema.Class<CommerceAccount>(
  "CommerceAccount"
)({
  businessUnitId: CommerceBusinessUnitId,
  customerId: CommerceCustomerId,
  registrationId: Schema.String,
}) {}

export class CommerceCustomer extends Schema.Class<CommerceCustomer>(
  "CommerceCustomer"
)({
  authUserId: Schema.String,
  customerId: CommerceCustomerId,
  email: Schema.Redacted(Schema.String, { label: "email" }),
  firstName: Schema.Redacted(Schema.String, { label: "personName" }),
  lastName: Schema.Redacted(Schema.String, { label: "personName" }),
}) {}

export class CommerceCustomerProfile extends Schema.Class<CommerceCustomerProfile>(
  "CommerceCustomerProfile"
)({
  customerId: CommerceCustomerId,
  email: Schema.optional(Schema.Redacted(Schema.String, { label: "email" })),
  firstName: Schema.optional(
    Schema.Redacted(Schema.String, { label: "personName" })
  ),
  lastName: Schema.optional(
    Schema.Redacted(Schema.String, { label: "personName" })
  ),
}) {}

export const CommerceCompanyRole = Schema.Literals(["owner", "associate"]);
export type CommerceCompanyRole = typeof CommerceCompanyRole.Type;

export class CommerceAssociateMembership extends Schema.Class<CommerceAssociateMembership>(
  "CommerceAssociateMembership"
)({
  authUserId: Schema.String,
  businessUnitId: CommerceBusinessUnitId,
  customerId: CommerceCustomerId,
  role: CommerceCompanyRole,
}) {}
