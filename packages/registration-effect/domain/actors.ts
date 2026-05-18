import { Schema } from "effect";
import { AuthUserId, CommerceBusinessUnitId, RedactedEmail } from "./identity";
import { CompanyRole } from "./roles";

export class RegistrationReviewerActor extends Schema.Class<RegistrationReviewerActor>(
  "RegistrationReviewerActor"
)({
  actorType: Schema.Literal("registration_reviewer"),
  authUserId: AuthUserId,
  email: RedactedEmail,
  name: Schema.String,
}) {}

export class CompanyActor extends Schema.Class<CompanyActor>("CompanyActor")({
  actorType: Schema.Literal("company"),
  authUserId: AuthUserId,
  email: RedactedEmail,
  businessUnitId: CommerceBusinessUnitId,
  role: CompanyRole,
}) {}

export class SystemActor extends Schema.Class<SystemActor>("SystemActor")({
  actorType: Schema.Literal("system"),
  name: Schema.String,
}) {}

export const Actor = Schema.Union([
  RegistrationReviewerActor,
  CompanyActor,
  SystemActor,
]);
export type Actor = typeof Actor.Type;

export const registrationSystemActor = new SystemActor({
  actorType: "system",
  name: "registration-effect",
});
