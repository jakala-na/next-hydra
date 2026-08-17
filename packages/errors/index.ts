import { Schema, SchemaIssue } from "effect";

/**
 * Stable client-facing error categories. Exact Effect error tags remain the
 * primary discriminator; categories let generic boundary code choose a broad
 * response without erasing the domain failure.
 */
export const ErrorCategory = Schema.Literals([
  "bad_input",
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "rate_limited",
  "unavailable",
  "unexpected",
]);
export type ErrorCategory = typeof ErrorCategory.Type;

export const ErrorRecovery = Schema.Literals([
  "fix_input",
  "reauthenticate",
  "request_access",
  "refresh",
  "retry",
  "none",
]);
export type ErrorRecovery = typeof ErrorRecovery.Type;

export class ErrorIssue extends Schema.Class<ErrorIssue>("ErrorIssue")({
  message: Schema.String,
  path: Schema.Array(Schema.String),
}) {}

export type PublicErrorFields = Readonly<
  Record<PropertyKey, Schema.Codec<unknown, unknown>>
>;

export interface PublicErrorOptions<
  Tag extends string,
  Category extends ErrorCategory,
  Code extends string,
  Recovery extends ErrorRecovery,
  Fields extends PublicErrorFields,
> {
  readonly tag: Tag;
  readonly category: Category;
  readonly code: Code;
  readonly recovery: Recovery;
  readonly status: number;
  readonly fields: Fields;
}

/**
 * Defines the safe wire representation of one exact domain error.
 *
 * The returned schema is suitable for both Schema.Result and HttpApiEndpoint
 * errors. `make` deliberately accepts only public fields, so private causes and
 * provider diagnostics cannot cross either boundary accidentally.
 */
export const definePublicError = <
  const Tag extends string,
  const Category extends ErrorCategory,
  const Code extends string,
  const Recovery extends ErrorRecovery,
  const Fields extends PublicErrorFields,
>(
  options: PublicErrorOptions<Tag, Category, Code, Recovery, Fields>
) => {
  const schema = Schema.TaggedStruct(options.tag, {
    category: Schema.Literal(options.category),
    code: Schema.Literal(options.code),
    message: Schema.String,
    recovery: Schema.Literal(options.recovery),
    ...options.fields,
  }).annotate({ httpApiStatus: options.status });

  type PublicFields = typeof schema.Type;
  type Projection = Omit<
    PublicFields,
    "_tag" | "category" | "code" | "recovery"
  >;

  const make = (fields: Projection): PublicFields =>
    Schema.decodeUnknownSync(schema)({
      _tag: options.tag,
      category: options.category,
      code: options.code,
      recovery: options.recovery,
      ...fields,
    });

  return { make, schema } as const;
};

const InputInvalidDefinition = definePublicError({
  category: "bad_input",
  code: "input.invalid",
  fields: {
    issues: Schema.NonEmptyArray(ErrorIssue),
  },
  recovery: "fix_input",
  status: 400,
  tag: "InputInvalid",
});

export const InputInvalid = InputInvalidDefinition.schema;
export type InputInvalid = typeof InputInvalid.Type;

export const makeInputInvalid = InputInvalidDefinition.make;

export type SchemaErrorIssuePath = readonly (
  | PropertyKey
  | { readonly key: PropertyKey }
)[];

const schemaErrorIssuePath = (
  path: SchemaErrorIssuePath | undefined
): readonly string[] => {
  if (path === undefined) {
    return [];
  }

  const keys = path.map((segment) =>
    typeof segment === "object" ? segment.key : segment
  );

  return keys.some((key) => typeof key === "symbol") ? [] : keys.map(String);
};

/**
 * Projects Effect Schema diagnostics into the safe, transport-neutral issue
 * vocabulary shared by HTTP APIs and actions. Schema's diagnostic prose stays
 * private; callers choose the public message while retaining field paths.
 */
export const makeSchemaErrorIssues = (
  error: Schema.SchemaError,
  message: string
): readonly [ErrorIssue, ...ErrorIssue[]] => {
  const formatted = SchemaIssue.makeFormatterStandardSchemaV1({
    checkHook: (issue) =>
      issue.issue._tag === "Pointer" || issue.issue._tag === "Composite"
        ? undefined
        : message,
    leafHook: () => message,
  })(error.issue);
  const issues = formatted.issues.map(
    (issue) =>
      new ErrorIssue({
        message,
        path: schemaErrorIssuePath(issue.path),
      })
  );
  const [first, ...remaining] = issues;

  return first === undefined
    ? [new ErrorIssue({ message, path: [] })]
    : [first, ...remaining];
};
