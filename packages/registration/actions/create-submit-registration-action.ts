import { ORPCError } from "@orpc/client";
import { getTranslations } from "@repo/i18n";
import { returnValidationErrors } from "next-safe-action";
import type {
  RegistrationInput,
  StartRegistrationResult,
} from "../contracts/schema";
import { registrationInputSchema } from "../contracts/schema";
import { createRegistrationFormSchema } from "../lib/registration-form-schema";
import { ActionError, action } from "../lib/safe-action";

export function createSubmitRegistrationAction(
  execute: (input: RegistrationInput) => Promise<StartRegistrationResult>
) {
  return action
    .inputSchema(async () => {
      const t = await getTranslations("web.registration.form");
      return createRegistrationFormSchema(t);
    })
    .action(async ({ parsedInput }) => {
      const t = await getTranslations("web.registration.form");
      const input = registrationInputSchema.parse(parsedInput);
      const registrationFormSchema = createRegistrationFormSchema(t);

      try {
        await execute(input);
      } catch (error) {
        if (
          error instanceof ORPCError &&
          (error.status === 400 || error.status === 409)
        ) {
          returnValidationErrors(registrationFormSchema, {
            _errors: [t("errors.invalidSubmission")],
          });
        }

        throw new ActionError(t("errors.submitFailed"));
      }

      return {
        email: input.email,
      };
    });
}
