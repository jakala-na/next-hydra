import { Schema } from "effect";

export const CommerceCustomerId = Schema.NonEmptyString.pipe(
  Schema.brand("CommerceCustomerId")
);
export type CommerceCustomerId = typeof CommerceCustomerId.Type;

export const CommerceBusinessUnitId = Schema.NonEmptyString.pipe(
  Schema.brand("CommerceBusinessUnitId")
);
export type CommerceBusinessUnitId = typeof CommerceBusinessUnitId.Type;

export class CommerceAccount extends Schema.Class<CommerceAccount>(
  "CommerceAccount"
)({
  registrationId: Schema.String,
  customerId: CommerceCustomerId,
  businessUnitId: CommerceBusinessUnitId,
}) {}

export class CommerceCustomer extends Schema.Class<CommerceCustomer>(
  "CommerceCustomer"
)({
  customerId: CommerceCustomerId,
  authUserId: Schema.String,
  email: Schema.Redacted(Schema.String, { label: "email" }),
  firstName: Schema.Redacted(Schema.String, { label: "personName" }),
  lastName: Schema.Redacted(Schema.String, { label: "personName" }),
}) {}

export const CommerceCompanyRole = Schema.Literals(["owner", "associate"]);
export type CommerceCompanyRole = typeof CommerceCompanyRole.Type;

export class CommerceAssociateMembership extends Schema.Class<CommerceAssociateMembership>(
  "CommerceAssociateMembership"
)({
  businessUnitId: CommerceBusinessUnitId,
  customerId: CommerceCustomerId,
  authUserId: Schema.String,
  role: CommerceCompanyRole,
}) {}
