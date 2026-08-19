import { Schema } from "effect";

export const RegistrationWorkflowHookName = Schema.Literals([
  "approval",
  "invitation",
]);
export type RegistrationWorkflowHookName =
  typeof RegistrationWorkflowHookName.Type;

export class RegistrationWorkflowHookPayloadValidationError extends Schema.TaggedErrorClass<RegistrationWorkflowHookPayloadValidationError>()(
  "RegistrationWorkflowHookPayloadValidationError",
  {
    hook: RegistrationWorkflowHookName,
    issues: Schema.Array(Schema.Unknown),
    message: Schema.String,
  }
) {}

export const isRegistrationWorkflowHookPayloadValidationError = Schema.is(
  RegistrationWorkflowHookPayloadValidationError
);
