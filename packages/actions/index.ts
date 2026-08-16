import { Effect, Result, Schema, SchemaIssue } from "effect";
import type { Layer, ManagedRuntime } from "effect";

type ActionInputSchema = Schema.Codec<unknown, unknown, never, unknown>;
type ActionOutputSchema = Schema.Codec<unknown, unknown, unknown>;
type ActionErrorSchema = Schema.Codec<unknown, unknown>;

export type EmptyActionContext = Readonly<Record<never, never>>;

export class ActionInputIssue extends Schema.Class<ActionInputIssue>(
  "ActionInputIssue"
)({
  path: Schema.Array(Schema.String),
  message: Schema.String,
}) {}

export class ActionInputInvalid extends Schema.TaggedErrorClass<ActionInputInvalid>()(
  "ActionInputInvalid",
  {
    issues: Schema.Array(ActionInputIssue),
  }
) {}

export type ActionFailure<Error extends Schema.Top> =
  | ActionInputInvalid
  | Error["Type"];

type ActionErrorSchemaWithInput<Error extends Schema.Top> = Schema.Union<
  readonly [typeof ActionInputInvalid, Error]
>;

const makeActionErrorSchema = <Error extends ActionErrorSchema>(error: Error) =>
  Schema.Union([ActionInputInvalid, error]);

export type EncodedActionResult<
  Output extends Schema.Top,
  Error extends Schema.Top,
> = Schema.ResultIso<Output, ActionErrorSchemaWithInput<Error>>;

type DisplayActionFailureSchema<Error extends Schema.Top> = Schema.Struct<{
  readonly displayMessage: typeof Schema.String;
  readonly error: Error;
}>;

export type DisplayActionResult<
  Output extends Schema.Top,
  Error extends Schema.Top,
> = Schema.ResultIso<
  Output,
  DisplayActionFailureSchema<ActionErrorSchemaWithInput<Error>>
>;

export const makeActionResultSchema = <
  Output extends ActionOutputSchema,
  Error extends ActionErrorSchema,
>(
  output: Output,
  error: Error
) => Schema.toCodecIso(Schema.Result(output, makeActionErrorSchema(error)));

export const makeDisplayActionResultSchema = <
  Output extends ActionOutputSchema,
  Error extends ActionErrorSchema,
>(
  output: Output,
  error: Error
) =>
  Schema.toCodecIso(
    Schema.Result(
      output,
      Schema.Struct({
        displayMessage: Schema.String,
        error: makeActionErrorSchema(error),
      })
    )
  );

/**
 * Reconstructs the Effect success and error channels after an action result
 * crosses React Flight or another serialized boundary.
 *
 * A rejected action Promise and an invalid wire result are boundary defects;
 * declared action failures return through the Effect error channel.
 */
export const actionToEffect =
  <Input, Output, Error, Encoded, DecodingServices>(
    resultSchema: Schema.Codec<
      Result.Result<Output, Error>,
      Encoded,
      DecodingServices
    >,
    action: (input: Input) => Promise<Encoded>
  ) =>
  (input: Input): Effect.Effect<Output, Error, DecodingServices> =>
    Effect.promise(async () => await action(input)).pipe(
      Effect.flatMap(Schema.decodeUnknownEffect(resultSchema)),
      Effect.orDie,
      Effect.flatMap(Effect.fromResult)
    );

export type ActionSchemaIssuePath = ReadonlyArray<
  PropertyKey | { readonly key: PropertyKey }
>;

const actionSchemaIssuePathKeys = (
  path: ActionSchemaIssuePath | undefined
): readonly string[] => {
  if (path === undefined) {
    return [];
  }

  const keys = path.map((segment) =>
    typeof segment === "object" ? segment.key : segment
  );

  return keys.some((key) => typeof key === "symbol") ? [] : keys.map(String);
};

const actionInputIssueFormatter = SchemaIssue.makeFormatterStandardSchemaV1({
  checkHook: (issue) =>
    issue.issue._tag === "Pointer" || issue.issue._tag === "Composite"
      ? undefined
      : "Invalid input.",
  leafHook: () => "Invalid input.",
});

const ensureActionInputIssues = (issues: readonly ActionInputIssue[]) =>
  issues.length === 0
    ? [new ActionInputIssue({ path: [], message: "Invalid input." })]
    : issues;

export const makeActionInputIssues = (
  error: Schema.SchemaError
): readonly ActionInputIssue[] => {
  const issues = actionInputIssueFormatter(error.issue).issues.map(
    (issue) =>
      new ActionInputIssue({
        path: actionSchemaIssuePathKeys(issue.path),
        message: issue.message,
      })
  );

  return ensureActionInputIssues(issues);
};

export const normalizeActionSchemaIssuePath = <Path extends string>(
  schema: Schema.Schema<Path>,
  path: ActionSchemaIssuePath | undefined,
  fallback: Path
): Path => {
  if (path === undefined) {
    return fallback;
  }

  const keys = actionSchemaIssuePathKeys(path);
  if (keys.length === 0) {
    return fallback;
  }

  const candidate = keys.join(".");
  return Schema.is(schema)(candidate) ? candidate : fallback;
};

export interface ActionFailureMessage<Error extends Schema.Top, Context> {
  readonly getFailureMessage: (
    error: ActionFailure<Error>,
    context: Context
  ) => string | PromiseLike<string>;
}

export interface ActionSuccessHandler<Output extends Schema.Top, Context> {
  /**
   * Runs after Effect execution so framework control flow such as Next redirect
   * crosses the Server Action boundary unchanged.
   */
  readonly onSuccess: (
    output: Output["Type"],
    context: Context
  ) => void | PromiseLike<void>;
}

type ContextMiddlewareOperation<ContextIn, ContextOut, Requires> = {
  readonly _tag: "Context";
  readonly resolve: (
    context: ContextIn
  ) => Effect.Effect<ContextOut, never, Requires>;
};

type ProvisionOperation<Context, Provides, Failure, Requires> = {
  readonly _tag: "Provide";
  readonly layer: (
    context: Context
  ) => Layer.Layer<Provides, Failure, Requires>;
};

/**
 * Per-execution action context. Register all Context middleware before calling
 * ActionClient.provide so every failure sees one complete Context.
 */
export interface ActionContextMiddleware<
  ContextIn extends object,
  ContextOut extends object,
  Requires = never,
> {
  readonly operation: ContextMiddlewareOperation<
    ContextIn,
    ContextOut,
    Requires
  >;
}

interface ActionProvision<
  Context extends object,
  Provides,
  Failure = never,
  Requires = never,
> {
  readonly operation: ProvisionOperation<Context, Provides, Failure, Requires>;
}

export type ActionMiddleware<
  ContextIn extends object,
  ContextOut extends object,
  Requires = never,
> = ActionContextMiddleware<ContextIn, ContextOut, Requires>;

function contextMiddleware<AddedContext extends object>(
  resolve: () => Effect.Effect<AddedContext>
): ActionContextMiddleware<
  EmptyActionContext,
  EmptyActionContext & AddedContext
>;
function contextMiddleware<
  ContextIn extends object,
  AddedContext extends object,
  Requires = never,
>(
  resolve: (context: ContextIn) => Effect.Effect<AddedContext, never, Requires>
): ActionContextMiddleware<ContextIn, ContextIn & AddedContext, Requires>;
function contextMiddleware<
  ContextIn extends object,
  AddedContext extends object,
  Requires = never,
>(
  resolve: (context: ContextIn) => Effect.Effect<AddedContext, never, Requires>
): ActionContextMiddleware<ContextIn, ContextIn & AddedContext, Requires> {
  return {
    operation: {
      _tag: "Context",
      resolve: (context) =>
        resolve(context).pipe(
          Effect.map((added) => ({ ...context, ...added }))
        ),
    },
  };
}

export const ActionMiddleware = {
  context: contextMiddleware,
} as const;

export interface ActionProcedure<
  Name extends string,
  Input extends ActionInputSchema,
  Output extends ActionOutputSchema,
  Error extends ActionErrorSchema,
  RuntimeServices,
  Context,
> {
  readonly name: Name;
  readonly inputSchema: Input;
  readonly outputSchema: Output;
  readonly errorSchema: ActionErrorSchemaWithInput<Error>;
  readonly resultSchema: Schema.Codec<
    Result.Result<Output["Type"], ActionFailure<Error>>,
    EncodedActionResult<Output, Error>
  >;
  readonly effect: (
    input: Input["Encoded"]
  ) => Effect.Effect<
    EncodedActionResult<Output, Error>,
    never,
    RuntimeServices
  >;
  readonly execute: (
    input: Input["Encoded"]
  ) => Promise<EncodedActionResult<Output, Error>>;
  readonly toAction: {
    (
      options: ActionFailureMessage<Error, Context>
    ): (input: Input["Encoded"]) => Promise<DisplayActionResult<Output, Error>>;
    (
      options?: ActionSuccessHandler<Output, Context>
    ): (input: Input["Encoded"]) => Promise<EncodedActionResult<Output, Error>>;
  };
  readonly toFormAction: {
    (
      options: ActionFailureMessage<Error, Context>
    ): (
      previousResult: DisplayActionResult<Output, Error> | null,
      input: Input["Encoded"]
    ) => Promise<DisplayActionResult<Output, Error>>;
    (
      options?: ActionSuccessHandler<Output, Context>
    ): (
      previousResult: EncodedActionResult<Output, Error> | null,
      input: Input["Encoded"]
    ) => Promise<EncodedActionResult<Output, Error>>;
  };
}

interface ActionProcedureMappedHandlerBuilder<
  Name extends string,
  Services,
  RuntimeServices,
  Context,
  Input extends ActionInputSchema,
  Output extends ActionOutputSchema,
  Error extends ActionErrorSchema,
  ProgramFailure,
> {
  readonly handle: <HandlerServices extends Services>(
    handler: (
      input: Input["Type"],
      context: Context
    ) => Effect.Effect<Output["Type"], ProgramFailure, HandlerServices>
  ) => ActionProcedure<Name, Input, Output, Error, RuntimeServices, Context>;
}

interface ActionProcedureHandlerBuilder<
  Name extends string,
  Services,
  ClientFailure,
  RuntimeServices,
  Context,
  Input extends ActionInputSchema,
  Output extends ActionOutputSchema,
  Error extends ActionErrorSchema,
> {
  readonly mapInputIssues: (
    mapper: (
      error: Schema.SchemaError,
      context: Context,
      input: Input["Encoded"]
    ) => readonly ActionInputIssue[]
  ) => ActionProcedureHandlerBuilder<
    Name,
    Services,
    ClientFailure,
    RuntimeServices,
    Context,
    Input,
    Output,
    Error
  >;
  readonly mapError: <ProgramFailure>(
    mapper: (
      error: ProgramFailure | ClientFailure,
      context: Context
    ) => Error["Type"]
  ) => ActionProcedureMappedHandlerBuilder<
    Name,
    Services,
    RuntimeServices,
    Context,
    Input,
    Output,
    Error,
    ProgramFailure
  >;
  readonly handle: <HandlerServices extends Services>(
    handler: (
      input: Input["Type"],
      context: Context
    ) => Effect.Effect<Output["Type"], Error["Type"], HandlerServices>,
    ...unmappedFailure: [ClientFailure] extends [Error["Type"]]
      ? readonly []
      : readonly [never]
  ) => ActionProcedure<Name, Input, Output, Error, RuntimeServices, Context>;
}

interface ActionProcedureErrorBuilder<
  Name extends string,
  Services,
  ClientFailure,
  RuntimeServices,
  Context,
  Input extends ActionInputSchema,
  Output extends ActionOutputSchema,
> {
  readonly error: <Error extends ActionErrorSchema>(
    schema: Error
  ) => ActionProcedureHandlerBuilder<
    Name,
    Services,
    ClientFailure,
    RuntimeServices,
    Context,
    Input,
    Output,
    Error
  >;
}

interface ActionProcedureOutputBuilder<
  Name extends string,
  Services,
  ClientFailure,
  RuntimeServices,
  Context,
  Input extends ActionInputSchema,
> {
  readonly output: <Output extends ActionOutputSchema>(
    schema: Output
  ) => ActionProcedureErrorBuilder<
    Name,
    Services,
    ClientFailure,
    RuntimeServices,
    Context,
    Input,
    Output
  >;
}

interface ActionProcedureInputBuilder<
  Name extends string,
  Services,
  ClientFailure,
  RuntimeServices,
  Context,
> {
  readonly input: <Input extends ActionInputSchema>(
    schema: Input
  ) => ActionProcedureOutputBuilder<
    Name,
    Services,
    ClientFailure,
    RuntimeServices,
    Context,
    Input
  >;
}

export interface ActionClient<
  Services,
  Failure,
  RuntimeServices,
  Context extends object = EmptyActionContext,
  Phase extends "Context" | "Provided" = "Context",
> {
  readonly procedure: <const Name extends string>(
    name: Name
  ) => ActionProcedureInputBuilder<
    Name,
    Services,
    Failure,
    RuntimeServices,
    Context
  >;
  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Requires proves middleware dependencies are already available.
  readonly use: <AddedContext extends object, Requires extends Services>(
    middleware: Phase extends "Context"
      ? ActionContextMiddleware<Context, Context & AddedContext, Requires>
      : never
  ) => ActionClient<
    Services,
    Failure,
    RuntimeServices,
    Context & AddedContext,
    Phase
  >;
  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Requires proves Layer dependencies are already available.
  readonly provide: <Provides, ProvisionFailure, Requires extends Services>(
    layer: (
      context: Context
    ) => Layer.Layer<Provides, ProvisionFailure, Requires>
  ) => ActionClient<
    Services | Provides,
    Failure | ProvisionFailure,
    RuntimeServices,
    Context,
    "Provided"
  >;
}

type AnyActionMiddleware = ActionMiddleware<object, object, unknown>;

type AnyActionProvision = ActionProvision<object, unknown, unknown, unknown>;

type AnyActionStep = AnyActionMiddleware | AnyActionProvision;

const isActionProvision = (step: AnyActionStep): step is AnyActionProvision =>
  step.operation._tag === "Provide";

interface PreparedAction<Context> {
  readonly context: Context;
  readonly provisions: readonly AnyActionProvision[];
}

const prepareActionSteps = (
  steps: readonly AnyActionStep[],
  index: number,
  context: object
): Effect.Effect<PreparedAction<object>, never, unknown> => {
  const current = steps[index];

  if (current === undefined) {
    return Effect.succeed({ context, provisions: [] });
  }

  if (current.operation._tag === "Context") {
    return current.operation
      .resolve(context)
      .pipe(
        Effect.flatMap((nextContext) =>
          prepareActionSteps(steps, index + 1, nextContext)
        )
      );
  }

  const provisions = steps.slice(index);

  if (!provisions.every(isActionProvision)) {
    return Effect.die(
      new Error("Action context must be configured before provide")
    );
  }

  return Effect.succeed({
    context,
    provisions,
  });
};

/* oxlint-disable typescript/no-unsafe-type-assertion -- Public action steps are erased only for heterogeneous traversal. */
const prepareAction = <Context extends object, RuntimeServices>(
  steps: readonly AnyActionStep[]
): Effect.Effect<PreparedAction<Context>, never, RuntimeServices> =>
  // The public ActionClient types prove the steps' context and requirements.
  // Runtime traversal erases them here and restores them once.
  prepareActionSteps(steps, 0, {}) as unknown as Effect.Effect<
    PreparedAction<Context>,
    never,
    RuntimeServices
  >;

const provideActionLayers = (
  provisions: readonly AnyActionProvision[],
  index: number,
  context: object,
  program: Effect.Effect<unknown, never, unknown>,
  recover: (error: unknown) => Effect.Effect<unknown>
): Effect.Effect<unknown, never, unknown> => {
  const current = provisions[index];

  return current === undefined
    ? program
    : provideActionLayers(
        provisions,
        index + 1,
        context,
        program,
        recover
      ).pipe(
        Effect.provide(current.operation.layer(context), { local: true }),
        // Recover at each nesting level so earlier Layers stay scoped around
        // mapping, encoding, and presenting a later Layer's acquisition error.
        // oxlint-disable-next-line promise/prefer-await-to-callbacks, promise/prefer-await-to-then -- This is an Effect combinator, not Promise control flow.
        Effect.catch(recover)
      );
};

/* oxlint-disable typescript/no-unnecessary-type-parameters -- ProvisionFailure restores the public failure type at this erased Layer seam. */
const provideAction = <Success, ProvisionFailure, Services, RuntimeServices>(
  provisions: readonly AnyActionProvision[],
  context: object,
  program: Effect.Effect<Success, never, Services>,
  recover: (error: ProvisionFailure) => Effect.Effect<Success>
): Effect.Effect<Success, never, RuntimeServices> =>
  provideActionLayers(
    provisions,
    0,
    context,
    program,
    recover as (error: unknown) => Effect.Effect<unknown>
  ) as unknown as Effect.Effect<Success, never, RuntimeServices>;
/* oxlint-enable typescript/no-unnecessary-type-parameters */
/* oxlint-enable typescript/no-unsafe-type-assertion */

/* oxlint-disable typescript/no-unnecessary-type-parameters -- ClientFailure connects provided Layer failures to the procedure mapper. */
const makeProcedure = <
  Name extends string,
  Services,
  ClientFailure,
  RuntimeServices,
  Context extends object,
  Input extends ActionInputSchema,
  Output extends ActionOutputSchema,
  Error extends ActionErrorSchema,
  ProgramFailure,
>(options: {
  readonly name: Name;
  readonly input: Input;
  readonly output: Output;
  readonly error: Error;
  readonly mapInputIssues: (
    error: Schema.SchemaError,
    context: Context,
    input: Input["Encoded"]
  ) => readonly ActionInputIssue[];
  readonly mapError: (
    error: ProgramFailure | ClientFailure,
    context: Context
  ) => Error["Type"];
  readonly handler: (
    input: Input["Type"],
    context: Context
  ) => Effect.Effect<Output["Type"], ProgramFailure, Services>;
  readonly steps: readonly AnyActionStep[];
  readonly runtime: ManagedRuntime.ManagedRuntime<RuntimeServices, never>;
}): ActionProcedure<Name, Input, Output, Error, RuntimeServices, Context> => {
  const errorSchema = makeActionErrorSchema(options.error);
  const resultSchema = makeActionResultSchema(options.output, options.error);
  const displayResultSchema = makeDisplayActionResultSchema(
    options.output,
    options.error
  );

  const decodeInput = (input: Input["Encoded"], context: Context) =>
    Schema.decodeUnknownEffect(options.input)(input, {
      errors: "all",
    }).pipe(
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This is an Effect combinator, not Promise control flow.
      Effect.tapError((error) =>
        Effect.logDebug("Action input validation failed", error).pipe(
          Effect.annotateLogs({ "action.name": options.name })
        )
      ),
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This is an Effect combinator, not Promise control flow.
      Effect.mapError(
        (error) =>
          new ActionInputInvalid({
            issues: ensureActionInputIssues(
              options.mapInputIssues(error, context, input)
            ),
          })
      ),
      Effect.result
    );

  const runBoundary = <Value>(
    input: Input["Encoded"],
    finalize: (
      result: Result.Result<Output["Type"], ActionFailure<Error>>,
      context: Context
    ) => Effect.Effect<Value>
  ): Effect.Effect<Value, never, RuntimeServices> =>
    prepareAction<Context, RuntimeServices>(options.steps).pipe(
      Effect.flatMap(({ context, provisions }) =>
        decodeInput(input, context).pipe(
          Effect.flatMap((decoded) => {
            if (Result.isFailure(decoded)) {
              return finalize(Result.fail(decoded.failure), context);
            }

            const program = options.handler(decoded.success, context).pipe(
              Effect.result,
              Effect.map(
                (
                  result
                ): Result.Result<Output["Type"], ActionFailure<Error>> =>
                  Result.isSuccess(result)
                    ? Result.succeed(result.success)
                    : Result.fail(options.mapError(result.failure, context))
              ),
              Effect.flatMap((result) => finalize(result, context))
            );

            return provideAction<
              Value,
              ClientFailure,
              Services,
              RuntimeServices
            >(
              provisions,
              context,
              program,
              // oxlint-disable-next-line promise/prefer-await-to-callbacks -- Layer recovery is an Effect callback, not Promise control flow.
              (error) =>
                finalize(Result.fail(options.mapError(error, context)), context)
            );
          })
        )
      ),
      Effect.withSpan(options.name)
    );

  const encodeResult = (
    result: Result.Result<Output["Type"], ActionFailure<Error>>
  ) => Schema.encodeEffect(resultSchema)(result).pipe(Effect.orDie);

  const effect = (input: Input["Encoded"]) =>
    runBoundary(input, (result) => encodeResult(result));

  const encodedResultEffect = (input: Input["Encoded"]) =>
    runBoundary(input, (result, context) =>
      encodeResult(result).pipe(
        Effect.map((encoded) => ({ context, encoded, result }))
      )
    );

  const displayEffect = (
    message: ActionFailureMessage<Error, Context>,
    input: Input["Encoded"]
  ) =>
    runBoundary(input, (result, context) => {
      const displayed: Effect.Effect<
        Result.Result<
          Output["Type"],
          {
            readonly error: ActionFailure<Error>;
            readonly displayMessage: string;
          }
        >
      > = Result.isSuccess(result)
        ? Effect.succeed(Result.succeed(result.success))
        : Effect.promise(async () =>
            Result.fail({
              displayMessage: await message.getFailureMessage(
                result.failure,
                context
              ),
              error: result.failure,
            })
          );

      return displayed.pipe(
        Effect.flatMap(Schema.encodeEffect(displayResultSchema)),
        Effect.orDie
      );
    });

  const execute = async (input: Input["Encoded"]) =>
    await options.runtime.runPromise(effect(input));

  const executeDisplay = async (
    message: ActionFailureMessage<Error, Context>,
    input: Input["Encoded"]
  ) => await options.runtime.runPromise(displayEffect(message, input));

  const executeSuccess = async (
    success: ActionSuccessHandler<Output, Context>,
    input: Input["Encoded"]
  ) => {
    const execution = await options.runtime.runPromise(
      encodedResultEffect(input)
    );

    // Framework terminal control flow such as Next redirect intentionally runs
    // after Effect execution so its thrown control signal is not captured as a
    // defect by the runtime.
    if (Result.isSuccess(execution.result)) {
      await success.onSuccess(execution.result.success, execution.context);
    }

    return execution.encoded;
  };

  function toAction(): (
    input: Input["Encoded"]
  ) => Promise<EncodedActionResult<Output, Error>>;
  function toAction(
    message: ActionFailureMessage<Error, Context>
  ): (input: Input["Encoded"]) => Promise<DisplayActionResult<Output, Error>>;
  function toAction(
    success: ActionSuccessHandler<Output, Context>
  ): (input: Input["Encoded"]) => Promise<EncodedActionResult<Output, Error>>;
  function toAction(
    adapter?:
      | ActionFailureMessage<Error, Context>
      | ActionSuccessHandler<Output, Context>
  ) {
    if (adapter === undefined) {
      return execute;
    }

    return "getFailureMessage" in adapter
      ? async (input: Input["Encoded"]) => await executeDisplay(adapter, input)
      : async (input: Input["Encoded"]) => await executeSuccess(adapter, input);
  }

  function toFormAction(): (
    previousResult: EncodedActionResult<Output, Error> | null,
    input: Input["Encoded"]
  ) => Promise<EncodedActionResult<Output, Error>>;
  function toFormAction(
    message: ActionFailureMessage<Error, Context>
  ): (
    previousResult: DisplayActionResult<Output, Error> | null,
    input: Input["Encoded"]
  ) => Promise<DisplayActionResult<Output, Error>>;
  function toFormAction(
    success: ActionSuccessHandler<Output, Context>
  ): (
    previousResult: EncodedActionResult<Output, Error> | null,
    input: Input["Encoded"]
  ) => Promise<EncodedActionResult<Output, Error>>;
  function toFormAction(
    adapter?:
      | ActionFailureMessage<Error, Context>
      | ActionSuccessHandler<Output, Context>
  ) {
    if (adapter === undefined) {
      return async (
        _previousResult: EncodedActionResult<Output, Error> | null,
        input: Input["Encoded"]
      ) => await execute(input);
    }

    return "getFailureMessage" in adapter
      ? async (
          _previousResult: DisplayActionResult<Output, Error> | null,
          input: Input["Encoded"]
        ) => await executeDisplay(adapter, input)
      : async (
          _previousResult: EncodedActionResult<Output, Error> | null,
          input: Input["Encoded"]
        ) => await executeSuccess(adapter, input);
  }

  return {
    effect,
    errorSchema,
    execute,
    inputSchema: options.input,
    name: options.name,
    outputSchema: options.output,
    resultSchema,
    toAction,
    toFormAction,
  };
};
/* oxlint-enable typescript/no-unnecessary-type-parameters */

const makeClient = <
  Services,
  Failure,
  RuntimeServices,
  Context extends object,
  Phase extends "Context" | "Provided",
>(
  runtime: ManagedRuntime.ManagedRuntime<RuntimeServices, never>,
  steps: readonly AnyActionStep[],
  phase: Phase
): ActionClient<Services, Failure, RuntimeServices, Context, Phase> => {
  const procedure = <const Name extends string>(
    name: Name
  ): ActionProcedureInputBuilder<
    Name,
    Services,
    Failure,
    RuntimeServices,
    Context
  > => ({
    input: <Input extends ActionInputSchema>(input: Input) => ({
      output: <Output extends ActionOutputSchema>(output: Output) => ({
        error: <Error extends ActionErrorSchema>(error: Error) => {
          const makeHandlerBuilder = (
            mapInputIssues: (
              issue: Schema.SchemaError,
              context: Context,
              encodedInput: Input["Encoded"]
            ) => readonly ActionInputIssue[] = makeActionInputIssues
          ): ActionProcedureHandlerBuilder<
            Name,
            Services,
            Failure,
            RuntimeServices,
            Context,
            Input,
            Output,
            Error
          > => {
            const handleWith = <ProgramFailure>(
              mapError: (
                failure: ProgramFailure | Failure,
                context: Context
              ) => Error["Type"]
            ): ActionProcedureMappedHandlerBuilder<
              Name,
              Services,
              RuntimeServices,
              Context,
              Input,
              Output,
              Error,
              ProgramFailure
            > => ({
              handle: <HandlerServices extends Services>(
                handler: (
                  decoded: Input["Type"],
                  context: Context
                ) => Effect.Effect<
                  Output["Type"],
                  ProgramFailure,
                  HandlerServices
                >
              ) =>
                makeProcedure({
                  error,
                  handler,
                  input,
                  mapError,
                  mapInputIssues,
                  name,
                  output,
                  runtime,
                  steps,
                }),
            });

            return {
              handle: <HandlerServices extends Services>(
                handler: (
                  decoded: Input["Type"],
                  context: Context
                ) => Effect.Effect<
                  Output["Type"],
                  Error["Type"],
                  HandlerServices
                >,
                ..._unmappedFailure: [Failure] extends [Error["Type"]]
                  ? readonly []
                  : readonly [never]
              ) =>
                makeProcedure({
                  error,
                  handler,
                  input,
                  mapError: (failure) =>
                    Schema.decodeUnknownSync(error)(failure),
                  mapInputIssues,
                  name,
                  output,
                  runtime,
                  steps,
                }),
              mapError: <ProgramFailure>(
                mapper: (
                  failure: ProgramFailure | Failure,
                  context: Context
                ) => Error["Type"]
              ) => handleWith(mapper),
              mapInputIssues: (mapper) => makeHandlerBuilder(mapper),
            };
          };

          return makeHandlerBuilder();
        },
      }),
    }),
  });

  // oxlint-disable-next-line typescript/no-unnecessary-type-parameters -- Requires proves middleware dependencies are already available.
  function use<AddedContext extends object, Requires extends Services>(
    next: Phase extends "Context"
      ? ActionContextMiddleware<Context, Context & AddedContext, Requires>
      : never
  ): ActionClient<
    Services,
    Failure,
    RuntimeServices,
    Context & AddedContext,
    Phase
  >;
  function use(next: unknown): unknown {
    if (phase === "Provided") {
      throw new Error("Action context must be configured before provide");
    }

    // The overload above proves this transition. Runtime storage erases the
    // heterogeneous Context types at this private seam.
    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ActionClient.use checked the transition before storage.
    const actionMiddleware = next as AnyActionMiddleware;

    return makeClient<Services, Failure, RuntimeServices, Context, Phase>(
      runtime,
      [...steps, actionMiddleware],
      phase
    );
  }

  const provide = <Provides, ProvisionFailure, Requires extends Services>(
    layer: (
      context: Context
    ) => Layer.Layer<Provides, ProvisionFailure, Requires>
  ): ActionClient<
    Services | Provides,
    Failure | ProvisionFailure,
    RuntimeServices,
    Context,
    "Provided"
  > => {
    const provision: ActionProvision<
      Context,
      Provides,
      ProvisionFailure,
      Requires
    > = {
      operation: { _tag: "Provide", layer },
    };

    return makeClient<
      Services | Provides,
      Failure | ProvisionFailure,
      RuntimeServices,
      Context,
      "Provided"
    >(
      runtime,
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- ActionClient.provide checked the provision before heterogeneous storage.
      [...steps, provision as AnyActionProvision],
      "Provided"
    );
  };

  return { procedure, provide, use };
};

const makeActionClient = <RuntimeServices>(
  runtime: ManagedRuntime.ManagedRuntime<RuntimeServices, never>
) =>
  makeClient<
    RuntimeServices,
    never,
    RuntimeServices,
    EmptyActionContext,
    "Context"
  >(runtime, [], "Context");

export const ActionClient = {
  make: makeActionClient,
} as const;
