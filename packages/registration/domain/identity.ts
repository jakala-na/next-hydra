import {
  CommerceBusinessUnitId as CommerceBusinessUnitIdSchema,
  CommerceCustomerId as CommerceCustomerIdSchema,
} from "@repo/commerce/domain/commerce-account";
import { Redacted, Schema, SchemaGetter } from "effect";

export const CommerceBusinessUnitId = CommerceBusinessUnitIdSchema;
export const CommerceCustomerId = CommerceCustomerIdSchema;
export type CommerceBusinessUnitId = typeof CommerceBusinessUnitId.Type;
export type CommerceCustomerId = typeof CommerceCustomerId.Type;

export const Email = Schema.String.pipe(Schema.brand("Email"));
export type Email = typeof Email.Type;

export const PersonName = Schema.String.pipe(Schema.brand("PersonName"));
export type PersonName = typeof PersonName.Type;

export const CompanyName = Schema.String.pipe(Schema.brand("CompanyName"));
export type CompanyName = typeof CompanyName.Type;

export const PhoneNumber = Schema.String.pipe(Schema.brand("PhoneNumber"));
export type PhoneNumber = typeof PhoneNumber.Type;

export const VatId = Schema.String.pipe(Schema.brand("VatId"));
export type VatId = typeof VatId.Type;

export const AddressLine = Schema.String.pipe(Schema.brand("AddressLine"));
export type AddressLine = typeof AddressLine.Type;

export const PostalCode = Schema.String.pipe(Schema.brand("PostalCode"));
export type PostalCode = typeof PostalCode.Type;

export const City = Schema.String.pipe(Schema.brand("City"));
export type City = typeof City.Type;

export const Region = Schema.String.pipe(Schema.brand("Region"));
export type Region = typeof Region.Type;

export const CountryCode = Schema.String.pipe(Schema.brand("CountryCode"));
export type CountryCode = typeof CountryCode.Type;

export const makePersistedRedacted = <S extends Schema.Top>(
  schema: S,
  label: string
) =>
  schema.pipe(
    Schema.decodeTo(Schema.Redacted(schema, { label }), {
      decode: SchemaGetter.transform((value: S["Type"]) =>
        Redacted.make(value, { label })
      ),
      encode: SchemaGetter.transform((value: Redacted.Redacted<S["Type"]>) =>
        Redacted.value(value)
      ),
    })
  );

export const RedactedEmail = makePersistedRedacted(Email, "email");
export type RedactedEmail = typeof RedactedEmail.Type;

export const RedactedPersonName = makePersistedRedacted(
  PersonName,
  "personName"
);
export type RedactedPersonName = typeof RedactedPersonName.Type;

export const AuthUserId = Schema.String.pipe(Schema.brand("AuthUserId"));
export type AuthUserId = typeof AuthUserId.Type;

export const RegistrationId = Schema.String.pipe(
  Schema.brand("RegistrationId")
);
export type RegistrationId = typeof RegistrationId.Type;

export const InvitationId = Schema.String.pipe(Schema.brand("InvitationId"));
export type InvitationId = typeof InvitationId.Type;

export const CompanyMemberInvitationId = Schema.NonEmptyString.pipe(
  Schema.brand("CompanyMemberInvitationId")
);
export type CompanyMemberInvitationId = typeof CompanyMemberInvitationId.Type;

export const IdentityUserProfile = Schema.Struct({
  authUserId: AuthUserId,
  email: RedactedEmail,
  firstName: Schema.optional(RedactedPersonName),
  lastName: Schema.optional(RedactedPersonName),
  name: Schema.String,
});
export type IdentityUserProfile = typeof IdentityUserProfile.Type;

export class AcceptedAuthIdentity extends Schema.Class<AcceptedAuthIdentity>(
  "AcceptedAuthIdentity"
)({
  authUserId: AuthUserId,
  email: RedactedEmail,
  firstName: RedactedPersonName,
  lastName: RedactedPersonName,
}) {}
