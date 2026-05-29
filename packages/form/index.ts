export type FormActionFieldError<Path extends string, Code extends string> = {
  readonly path: Path;
  readonly code: Code;
};

export type FormActionFormError<Code extends string> = {
  readonly code: Code;
};

export type InvalidFormActionResult<
  Path extends string,
  FieldCode extends string,
  FormCode extends string,
> = {
  readonly status: "invalid";
  readonly fieldErrors: readonly FormActionFieldError<Path, FieldCode>[];
  readonly formErrors: readonly FormActionFormError<FormCode>[];
};
