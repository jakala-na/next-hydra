import { ErrorIssue, makeInputInvalid } from "@repo/errors";
import { Result, Schema } from "effect";
import { describe, expect, it } from "vitest";

import { RegistrationId } from "../domain/identity";
import {
  DuplicateRegistrationEmail,
  RegistrationIntakeValidationError,
} from "../domain/registration-intake-validation";
import {
  projectRegistrationIntakeValidation,
  RegistrationApiErrorFailure,
  RegistrationSubmissionOutcomeUnknownFailure,
} from "../public-errors";
import {
  RegistrationFormInputSchema,
  RegistrationFormResultSchema,
} from "./registration-form-schema";

const validInput = {
  companyName: "  Hydra Supply  ",
  companyPhone: " 555-0100 ",
  vatId: " US123 ",
  contactFirstName: " Ada ",
  contactLastName: " Lovelace ",
  email: " ada@example.com ",
  address: {
    streetName: " 1 Main Street ",
    additionalStreetInfo: " Suite 2 ",
    postalCode: " 10001 ",
    city: " New York ",
    region: " NY ",
    country: "US",
  },
} as const;

const validationFailure = projectRegistrationIntakeValidation(
  new RegistrationIntakeValidationError({
    message: "Registration has field validation errors",
    reasons: [
      new DuplicateRegistrationEmail({
        code: "duplicateEmail",
        path: "email",
      }),
    ],
  }),
  "en-US"
);

const registrationFailures = [
  makeInputInvalid({
    issues: [new ErrorIssue({ message: "Invalid input.", path: ["email"] })],
    message: "Invalid input.",
  }),
  RegistrationApiErrorFailure.make({ message: "Unavailable." }),
  RegistrationSubmissionOutcomeUnknownFailure.make({
    message: "Registration outcome is unknown.",
  }),
  validationFailure,
] as const;

describe("public registration action schemas", () => {
  it("decodes and transforms untrusted form values", () => {
    const input = Schema.decodeUnknownSync(RegistrationFormInputSchema)(
      validInput
    );

    expect(input).toEqual({
      companyName: "Hydra Supply",
      companyPhone: "555-0100",
      vatId: "US123",
      contactFirstName: "Ada",
      contactLastName: "Lovelace",
      email: "ada@example.com",
      address: {
        streetName: "1 Main Street",
        additionalStreetInfo: "Suite 2",
        postalCode: "10001",
        city: "New York",
        region: "NY",
        country: "US",
      },
    });
  });

  it("rejects malformed form values", () => {
    expect(() =>
      Schema.decodeUnknownSync(RegistrationFormInputSchema)({
        ...validInput,
        email: "not-an-email",
      })
    ).toThrow();
  });

  it("enforces conditional region validation in the shared schema", () => {
    expect(() =>
      Schema.decodeUnknownSync(RegistrationFormInputSchema)({
        ...validInput,
        address: {
          ...validInput.address,
          region: "",
        },
      })
    ).toThrow();
  });

  it("round-trips a successful action result", () => {
    const encoded = Schema.encodeSync(RegistrationFormResultSchema)(
      Result.succeed({
        registrationId: RegistrationId.make("registration-1"),
      })
    );
    const decoded = Schema.decodeUnknownSync(RegistrationFormResultSchema)(
      encoded
    );

    expect(encoded).toEqual({
      _tag: "Success",
      success: { registrationId: "registration-1" },
    });
    expect(Result.isSuccess(decoded)).toBe(true);
  });

  it("round-trips translated form issues", () => {
    const encoded = Schema.encodeSync(RegistrationFormResultSchema)(
      Result.fail(validationFailure)
    );
    const decoded = Schema.decodeUnknownSync(RegistrationFormResultSchema)(
      encoded
    );

    expect(encoded).toMatchObject({
      _tag: "Failure",
      failure: {
        _tag: "RegistrationApiValidationError",
        category: "bad_input",
        code: "registration.invalidInput",
        issues: [
          {
            path: ["email"],
            message:
              "This email is already associated with an existing or pending registration.",
          },
        ],
        recovery: "fix_input",
      },
    });
    expect(Result.isFailure(decoded)).toBe(true);
  });

  it.each(registrationFailures)("round-trips the $_tag failure", (failure) => {
    const encoded = Schema.encodeSync(RegistrationFormResultSchema)(
      Result.fail(failure)
    );
    const decoded = Schema.decodeUnknownSync(RegistrationFormResultSchema)(
      encoded
    );

    expect(Schema.encodeSync(RegistrationFormResultSchema)(decoded)).toEqual(
      encoded
    );
  });
});
