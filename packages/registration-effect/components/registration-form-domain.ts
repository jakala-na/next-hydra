import { Redacted } from "effect";
import {
  AddressLine,
  City,
  CompanyName,
  CountryCode,
  Email,
  PersonName,
  PhoneNumber,
  PostalCode,
  Region,
  VatId,
} from "../domain/identity";
import {
  CompanyAddress,
  CompanyRegistrationDetails,
} from "../domain/registration";
import type { RegistrationFormInput } from "./registration-form-schema";

const optionalRedacted = <A extends string>(
  value: string,
  make: (rawValue: string) => A,
  label: string
) =>
  value.length === 0
    ? undefined
    : Redacted.make(make(value), {
        label,
      });

export const registrationFormInputToDetails = (
  input: RegistrationFormInput
) => {
  const companyPhone = optionalRedacted(
    input.companyPhone,
    PhoneNumber.make,
    "companyPhone"
  );
  const vatId = optionalRedacted(input.vatId, VatId.make, "vatId");
  const additionalStreetInfo = optionalRedacted(
    input.address.additionalStreetInfo,
    AddressLine.make,
    "addressLine"
  );
  const region = optionalRedacted(input.address.region, Region.make, "region");

  return new CompanyRegistrationDetails({
    companyName: CompanyName.make(input.companyName),
    ...(companyPhone ? { companyPhone } : {}),
    ...(vatId ? { vatId } : {}),
    contactFirstName: Redacted.make(PersonName.make(input.contactFirstName), {
      label: "personName",
    }),
    contactLastName: Redacted.make(PersonName.make(input.contactLastName), {
      label: "personName",
    }),
    email: Redacted.make(Email.make(input.email), { label: "email" }),
    address: new CompanyAddress({
      streetName: Redacted.make(AddressLine.make(input.address.streetName), {
        label: "addressLine",
      }),
      ...(additionalStreetInfo ? { additionalStreetInfo } : {}),
      postalCode: Redacted.make(PostalCode.make(input.address.postalCode), {
        label: "postalCode",
      }),
      city: Redacted.make(City.make(input.address.city), { label: "city" }),
      ...(region ? { region } : {}),
      country: CountryCode.make(input.address.country),
    }),
  });
};
