"use server";

import { registrationMessageKey } from "@repo/commerce/lib/b2b-registration/message-keys";
import type { ValidationErrors } from "next-safe-action";
import { returnValidationErrors } from "next-safe-action";
import { registrationFormSchema } from "./registration-form-schema";
import { ActionError, action } from "./safe-action";

const TRAILING_SLASH_PATTERN = /\/$/;

const normalizeOptionalText = (value: string) => {
  const trimmed = value.trim();
  return trimmed === "" ? undefined : trimmed;
};

export const submitRegistrationAction = action
  .schema(registrationFormSchema)
  .action(async ({ parsedInput }) => {
    const {
      apiBaseUrl,
      companyPhone,
      vatId,
      address: { additionalStreetInfo, region, ...address },
      ...registration
    } = parsedInput;
    const response = await fetch(
      `${apiBaseUrl.replace(TRAILING_SLASH_PATTERN, "")}/api/registrations`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({
          ...registration,
          companyPhone: normalizeOptionalText(companyPhone),
          vatId: normalizeOptionalText(vatId),
          address: {
            ...address,
            additionalStreetInfo: normalizeOptionalText(additionalStreetInfo),
            region: normalizeOptionalText(region),
          },
        }),
      }
    );
    const payload: {
      error?: string;
      issues?: ValidationErrors<typeof registrationFormSchema>;
    } | null = await response.json().catch(() => null);

    if (!response.ok) {
      if (response.status === 400 || response.status === 409) {
        returnValidationErrors(registrationFormSchema, {
          ...(payload?.issues ?? {}),
          _errors: payload?.issues?._errors?.length
            ? payload.issues._errors
            : [
                payload?.error ??
                  registrationMessageKey("errors.invalidSubmission"),
              ],
        });
      }

      throw new ActionError(
        payload?.error ?? registrationMessageKey("errors.submitFailed")
      );
    }

    return {
      email: parsedInput.email,
    };
  });
