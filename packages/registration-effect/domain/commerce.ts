import { Schema } from "effect";
import {
  AuthUserId,
  CommerceBusinessUnitId,
  CommerceCustomerId,
  RedactedEmail,
  RedactedPersonName,
  RegistrationId,
} from "./identity";
import { CompanyRole } from "./roles";

export class CommerceAccount extends Schema.Class<CommerceAccount>(
  "CommerceAccount"
)({
  registrationId: RegistrationId,
  customerId: CommerceCustomerId,
  businessUnitId: CommerceBusinessUnitId,
}) {}

export class CommerceCustomer extends Schema.Class<CommerceCustomer>(
  "CommerceCustomer"
)({
  customerId: CommerceCustomerId,
  authUserId: AuthUserId,
  email: RedactedEmail,
  firstName: RedactedPersonName,
  lastName: RedactedPersonName,
}) {}

export class CommerceAssociateMembership extends Schema.Class<CommerceAssociateMembership>(
  "CommerceAssociateMembership"
)({
  businessUnitId: CommerceBusinessUnitId,
  customerId: CommerceCustomerId,
  authUserId: AuthUserId,
  role: CompanyRole,
}) {}
