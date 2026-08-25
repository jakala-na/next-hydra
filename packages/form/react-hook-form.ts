import type { FieldPath, FieldValues, UseFormReturn } from "react-hook-form";

import type { InvalidFormActionResult } from "./index";

export type ReactHookFormActionErrorMessages<
  FieldCode extends string,
  FormCode extends string,
> = {
  readonly field: Record<FieldCode, string>;
  readonly form: Record<FormCode, string>;
};

export const setReactHookFormRootError = <Values extends FieldValues>(
  form: UseFormReturn<Values>,
  message: string
) => {
  form.setError("root.serverError", {
    message,
    type: "server",
  });
};

export const setReactHookFormActionErrors = <
  Values extends FieldValues,
  Path extends FieldPath<Values>,
  FieldCode extends string,
  FormCode extends string,
>(
  form: UseFormReturn<Values>,
  result: InvalidFormActionResult<Path, FieldCode, FormCode>,
  messages: ReactHookFormActionErrorMessages<FieldCode, FormCode>
) => {
  for (const error of result.fieldErrors) {
    form.setError(error.path, {
      message: messages.field[error.code],
      type: "server",
    });
  }

  const [firstFormError] = result.formErrors;

  if (firstFormError) {
    setReactHookFormRootError(form, messages.form[firstFormError.code]);
  }
};
