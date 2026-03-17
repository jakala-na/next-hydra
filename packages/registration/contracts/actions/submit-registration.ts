import type { SafeActionFn, ValidationErrors } from "next-safe-action";
import type { RegistrationFormSchema } from "../../lib/registration-form-schema";

export type SubmitRegistrationAction = SafeActionFn<
  string,
  RegistrationFormSchema,
  [],
  ValidationErrors<RegistrationFormSchema>,
  { email: string }
>;
