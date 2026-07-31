import { ISO_COUNTRY_CODES } from "@repo/i18n/countries";
import { Schema, SchemaTransformation } from "effect";

export const CountryCode = Schema.Literals(ISO_COUNTRY_CODES).pipe(
  Schema.brand("CountryCode")
);
export type CountryCode = typeof CountryCode.Type;

export const CountryCodeFromString = Schema.Trim.pipe(
  Schema.decodeTo(Schema.String, SchemaTransformation.toUpperCase()),
  Schema.decodeTo(CountryCode)
);

export const Address = Schema.Struct({
  addressLine1: Schema.String,
  postalCode: Schema.String,
  city: Schema.String,
  country: CountryCode,
  addressLine2: Schema.optional(Schema.String),
  region: Schema.optional(Schema.String),
});
export type Address = typeof Address.Type;
