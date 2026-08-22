import { ErrorIssue } from "@repo/errors";
import { Context, Effect, Layer, ManagedRuntime, Schema } from "effect";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  ActionClient,
  ActionMiddleware,
  normalizeActionSchemaIssuePath,
} from "./index";

class TestFailure extends Schema.TaggedError<TestFailure>()(
  "TestFailure",
  { reason: Schema.String }
) {}

class TestRuntimeFailure extends Schema.TaggedError<TestRuntimeFailure>()(
  "TestRuntimeFailure",
  {}
) {}

class Greeting extends Context.Service<Greeting, { readonly prefix: string }>()(
  "@repo/actions/test/Greeting"
) {}

class Subject extends Context.Service<Subject, { readonly name: string }>()(
  "@repo/actions/test/Subject"
) {}

const TestInput = Schema.Struct({
  name: Schema.Trim.pipe(Schema.check(Schema.isMinLength(1))),
});

const Actions = ActionClient.make(ManagedRuntime.make(Layer.empty));

const makeGreeting = () =>
  Actions.procedure("Test.greet")
    .input(TestInput)
    .output(Schema.String)
    .error(TestFailure);

describe("ActionClient", () => {
  it("normalizes schema issue paths for public action failures", () => {
    const IssuePath = Schema.Literals(["root", "address.city"]);

    expect(
      normalizeActionSchemaIssuePath(
        IssuePath,
        [{ key: "address" }, "city"],
        "root"
      )
    ).toBe("address.city");
    expect(
      normalizeActionSchemaIssuePath(IssuePath, [Symbol("private")], "root")
    ).toBe("root");
  });

  it("builds a reusable procedure with Effect and Promise execution", async () => {
    const procedure = makeGreeting().handle(({ name }) =>
      Effect.succeed(`Hello, ${name}`)
    );

    await expect(
      Effect.runPromise(procedure.effect({ name: "  Ada  " }))
    ).resolves.toStrictEqual({ _tag: "Success", success: "Hello, Ada" });
    await expect(procedure.execute({ name: "Grace" })).resolves.toStrictEqual({
      _tag: "Success",
      success: "Hello, Grace",
    });
  });

  it("returns declared input failures without running the handler", async () => {
    const handler = vi.fn(() => Effect.succeed("unreachable"));
    const action = makeGreeting().handle(handler).toAction();

    await expect(action({ name: "   " })).resolves.toStrictEqual({
      _tag: "Failure",
      failure: {
        _tag: "InputInvalid",
        category: "bad_input",
        code: "input.invalid",
        issues: [{ message: "Invalid input.", path: ["name"] }],
        message: "Invalid input.",
        recovery: "fix_input",
      },
    });
    expect(handler).not.toHaveBeenCalled();
  });

  it("preserves nested paths from schema-level checks", async () => {
    const NestedInput = Schema.Struct({
      address: Schema.Struct({ region: Schema.String }),
    }).pipe(
      Schema.check(
        Schema.makeFilter((input) =>
          input.address.region === ""
            ? { issue: "Region is required", path: ["address", "region"] }
            : undefined
        )
      )
    );
    const action = Actions.procedure("Test.nestedInput")
      .input(NestedInput)
      .output(Schema.String)
      .error(TestFailure)
      .handle(() => Effect.succeed("unreachable"))
      .toAction();

    await expect(action({ address: { region: "" } })).resolves.toStrictEqual({
      _tag: "Failure",
      failure: {
        _tag: "InputInvalid",
        category: "bad_input",
        code: "input.invalid",
        issues: [
          {
            message: "Invalid input.",
            path: ["address", "region"],
          },
        ],
        message: "Invalid input.",
        recovery: "fix_input",
      },
    });
  });

  it("decodes invalid input before acquiring provided Layers", async () => {
    const acquire = vi.fn();
    const RequestActions = Actions.provide(() =>
      Layer.effectDiscard(
        Effect.sync(acquire).pipe(
          Effect.andThen(Effect.fail(new TestRuntimeFailure()))
        )
      )
    );
    const action = RequestActions.procedure("Test.decodeBeforeProvide")
      .input(TestInput)
      .output(Schema.String)
      .error(TestRuntimeFailure)
      .handle(({ name }) => Effect.succeed(name))
      .toAction();

    await expect(action({ name: "   " })).resolves.toStrictEqual({
      _tag: "Failure",
      failure: {
        _tag: "InputInvalid",
        category: "bad_input",
        code: "input.invalid",
        issues: [{ message: "Invalid input.", path: ["name"] }],
        message: "Invalid input.",
        recovery: "fix_input",
      },
    });
    expect(acquire).not.toHaveBeenCalled();
  });

  it("makes context and encoded input available to input issue mapping", async () => {
    const mapInputIssues = vi.fn(() => [
      new ErrorIssue({ message: "Use a name.", path: ["name"] }),
    ]);
    const action = Actions.procedure("Test.inputErrorContext")
      .input(TestInput)
      .output(Schema.String)
      .error(TestFailure)
      .mapInputIssues(mapInputIssues)
      .handle(({ name }) => Effect.succeed(name))
      .toAction();
    const input = { name: "   " };

    await expect(action(input)).resolves.toStrictEqual({
      _tag: "Failure",
      failure: {
        _tag: "InputInvalid",
        category: "bad_input",
        code: "input.invalid",
        issues: [{ message: "Use a name.", path: ["name"] }],
        message: "Invalid input.",
        recovery: "fix_input",
      },
    });
    expect(mapInputIssues).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      {},
      input
    );
  });

  it("preserves an already-public Effect failure without a mapper", async () => {
    const procedure = makeGreeting().handle(() =>
      Effect.fail(new TestFailure({ reason: "invalid" }))
    );

    await expect(procedure.execute({ name: "Ada" })).resolves.toStrictEqual({
      _tag: "Failure",
      failure: { _tag: "TestFailure", reason: "invalid" },
    });
  });

  it("maps private program failures into the declared public error", async () => {
    const procedure = makeGreeting()
      .mapError((reason: string) => new TestFailure({ reason }))
      .handle(() => Effect.fail("private diagnostic"));

    await expect(procedure.execute({ name: "Ada" })).resolves.toStrictEqual({
      _tag: "Failure",
      failure: { _tag: "TestFailure", reason: "private diagnostic" },
    });
  });

  it("adapts a procedure to the reducer signature used by useActionState", async () => {
    const formAction = makeGreeting()
      .handle(({ name }) => Effect.succeed(`Hello, ${name}`))
      .toFormAction();

    await expect(formAction(null, { name: "Ada" })).resolves.toStrictEqual({
      _tag: "Success",
      success: "Hello, Ada",
    });
  });

  it("adds a schema-encoded display message without replacing the Effect failure", async () => {
    const procedure = makeGreeting().handle(() =>
      Effect.fail(new TestFailure({ reason: "invalid" }))
    );
    const formAction = procedure.toFormAction({
      getFailureMessage: (error) => `Localized ${error._tag}`,
    });

    await expect(formAction(null, { name: "Ada" })).resolves.toStrictEqual({
      _tag: "Failure",
      failure: {
        displayMessage: "Localized TestFailure",
        error: { _tag: "TestFailure", reason: "invalid" },
      },
    });
  });

  it("does not invoke the failure presenter for successful actions", async () => {
    const getFailureMessage = vi.fn(() => "unreachable");
    const action = makeGreeting()
      .handle(({ name }) => Effect.succeed(`Hello, ${name}`))
      .toAction({ getFailureMessage });

    await expect(action({ name: "Ada" })).resolves.toStrictEqual({
      _tag: "Success",
      success: "Hello, Ada",
    });
    expect(getFailureMessage).not.toHaveBeenCalled();
  });

  it("runs a success adapter with the same resolved action context", async () => {
    const getLocale = vi.fn(() => "fr-FR");
    const onSuccess = vi.fn();
    const ContextualActions = ActionClient.make(
      ManagedRuntime.make(Layer.empty)
    ).use(
      ActionMiddleware.context(() =>
        Effect.sync(getLocale).pipe(Effect.map((locale) => ({ locale })))
      )
    );
    const action = ContextualActions.procedure("Test.successAdapter")
      .input(TestInput)
      .output(Schema.String)
      .error(TestFailure)
      .handle(({ name }) => Effect.succeed(`Hello, ${name}`))
      .toAction({ onSuccess });

    await expect(action({ name: "Ada" })).resolves.toStrictEqual({
      _tag: "Success",
      success: "Hello, Ada",
    });
    expect(getLocale).toHaveBeenCalledOnce();
    expect(onSuccess).toHaveBeenCalledExactlyOnceWith("Hello, Ada", {
      locale: "fr-FR",
    });
  });

  it("shares one resolved invocation with runtime provision and failure presentation", async () => {
    const resolveInvocation = vi.fn<() => string>(() => "pt-PT");
    const handleInvocation = vi.fn<(invocation: string) => void>();
    const provideInvocation = vi.fn<(invocation: string) => void>();
    const ContextualActions = ActionClient.make(
      ManagedRuntime.make(Layer.empty)
    )
      .use(
        ActionMiddleware.context(() =>
          Effect.sync(resolveInvocation).pipe(
            Effect.map((locale) => ({ locale }))
          )
        )
      )
      .provide(({ locale }) =>
        Layer.effectDiscard(
          Effect.sync(() => {
            provideInvocation(locale);
          })
        )
      );
    const procedure = ContextualActions.procedure("Test.localized")
      .input(TestInput)
      .output(Schema.String)
      .error(TestFailure)
      .handle((_input, { locale }) =>
        Effect.sync(() => {
          handleInvocation(locale);
        }).pipe(
          Effect.andThen(Effect.fail(new TestFailure({ reason: "invalid" })))
        )
      );
    const action = procedure.toAction({
      getFailureMessage: (error, { locale }) => `${locale}:${error._tag}`,
    });

    await expect(action({ name: "Ada" })).resolves.toStrictEqual({
      _tag: "Failure",
      failure: {
        displayMessage: "pt-PT:TestFailure",
        error: { _tag: "TestFailure", reason: "invalid" },
      },
    });
    expect(resolveInvocation).toHaveBeenCalledOnce();
    expect(handleInvocation).toHaveBeenCalledExactlyOnceWith("pt-PT");
    expect(provideInvocation).toHaveBeenCalledExactlyOnceWith("pt-PT");
  });

  it("keeps request Layer resources alive through failure presentation", async () => {
    let active = false;
    const RequestActions = Actions.provide(() =>
      Layer.effectDiscard(
        Effect.acquireRelease(
          Effect.sync(() => {
            active = true;
          }),
          () =>
            Effect.sync(() => {
              active = false;
            })
        )
      )
    );
    const action = RequestActions.procedure("Test.scopedPresentation")
      .input(TestInput)
      .output(Schema.String)
      .error(TestFailure)
      .handle(() => Effect.fail(new TestFailure({ reason: "invalid" })))
      .toAction({
        getFailureMessage: () => (active ? "active" : "released"),
      });

    await expect(action({ name: "Ada" })).resolves.toStrictEqual({
      _tag: "Failure",
      failure: {
        displayMessage: "active",
        error: { _tag: "TestFailure", reason: "invalid" },
      },
    });
    expect(active).toBeFalsy();
  });

  it("keeps acquired Layers alive while presenting a later Layer acquisition failure", async () => {
    let active = false;
    const RequestActions = Actions.provide(() =>
      Layer.effectDiscard(
        Effect.acquireRelease(
          Effect.sync(() => {
            active = true;
          }),
          () =>
            Effect.sync(() => {
              active = false;
            })
        )
      )
    ).provide(() => Layer.effectDiscard(Effect.fail(new TestRuntimeFailure())));
    const action = RequestActions.procedure("Test.layerFailurePresentation")
      .input(TestInput)
      .output(Schema.String)
      .error(TestRuntimeFailure)
      .handle(({ name }) => Effect.succeed(`Hello, ${name}`))
      .toAction({
        getFailureMessage: () => (active ? "active" : "released"),
      });

    await expect(action({ name: "Ada" })).resolves.toStrictEqual({
      _tag: "Failure",
      failure: {
        displayMessage: "active",
        error: { _tag: "TestRuntimeFailure" },
      },
    });
    expect(active).toBeFalsy();
  });

  it("rejects context middleware registered after provide", () => {
    const ProvidedActions = Actions.provide(() => Layer.empty);

    expect(() =>
      ProvidedActions.use(
        // @ts-expect-error Context must be complete before Layers are provided.
        ActionMiddleware.context(() => Effect.succeed({ locale: "en-US" }))
      )
    ).toThrow("Action context must be configured before provide");
  });

  it("does not expose unchecked additional action arguments", () => {
    const procedure = makeGreeting().handle(({ name }) =>
      Effect.succeed(`Hello, ${name}`)
    );
    const action = procedure.toAction();
    const formAction = procedure.toFormAction();

    expectTypeOf<Parameters<typeof procedure.execute>>().toEqualTypeOf<
      [typeof TestInput.Encoded]
    >();
    expectTypeOf<Parameters<typeof procedure.effect>>().toEqualTypeOf<
      [typeof TestInput.Encoded]
    >();
    expectTypeOf<Parameters<typeof action>>().toEqualTypeOf<
      [typeof TestInput.Encoded]
    >();
    expectTypeOf<Parameters<typeof formAction>>().toEqualTypeOf<
      [Parameters<typeof formAction>[0], typeof TestInput.Encoded]
    >();
  });

  it("supports FormData through an Effect input schema", async () => {
    const procedure = Actions.procedure("Test.form")
      .input(Schema.fromFormData(Schema.Struct({ name: Schema.String })))
      .output(Schema.String)
      .error(TestFailure)
      .handle(({ name }) => Effect.succeed(name));
    const data = new FormData();
    data.set("name", "Ada");

    await expect(procedure.toFormAction()(null, data)).resolves.toStrictEqual({
      _tag: "Success",
      success: "Ada",
    });
  });

  it("composes provided capabilities and their Layer requirements", async () => {
    const AuthenticatedActions = Actions.provide(() =>
      Layer.succeed(Greeting, { prefix: "Welcome" })
    ).provide(() =>
      Layer.effect(
        Subject,
        Greeting.pipe(Effect.map(({ prefix }) => ({ name: `${prefix}, Ada` })))
      )
    );
    const procedure = AuthenticatedActions.procedure("Test.authenticated")
      .input(TestInput)
      .output(Schema.String)
      .error(TestFailure)
      .handle(() => Subject.pipe(Effect.map(({ name }) => name)));

    await expect(procedure.execute({ name: "Ada" })).resolves.toStrictEqual({
      _tag: "Success",
      success: "Welcome, Ada",
    });
  });

  it("maps failures introduced by provided Layers", async () => {
    const AuthenticatedActions = Actions.provide(() =>
      Layer.effect(Greeting, Effect.fail(new TestRuntimeFailure()))
    );
    const procedure = AuthenticatedActions.procedure("Test.runtimeFailure")
      .input(TestInput)
      .output(Schema.String)
      .error(TestRuntimeFailure)
      .handle(({ name }) =>
        Greeting.pipe(Effect.map(({ prefix }) => `${prefix}, ${name}`))
      );

    await expect(procedure.execute({ name: "Ada" })).resolves.toStrictEqual({
      _tag: "Failure",
      failure: { _tag: "TestRuntimeFailure" },
    });
  });

  it("builds provided request Layers for each procedure execution", async () => {
    let builds = 0;
    const RequestActions = Actions.provide(() =>
      Layer.sync(Greeting, () => {
        builds += 1;
        return { prefix: `request-${builds}` };
      })
    );
    const procedure = RequestActions.procedure("Test.requestScoped")
      .input(TestInput)
      .output(Schema.String)
      .error(TestFailure)
      .handle(() => Greeting.pipe(Effect.map(({ prefix }) => prefix)));

    await expect(procedure.execute({ name: "Ada" })).resolves.toStrictEqual({
      _tag: "Success",
      success: "request-1",
    });
    await expect(procedure.execute({ name: "Grace" })).resolves.toStrictEqual({
      _tag: "Success",
      success: "request-2",
    });
  });

  it("does not turn defects or invalid declared outputs into action failures", async () => {
    const defect = makeGreeting().handle(() => Effect.die("unexpected"));
    const invalidOutput = Actions.procedure("Test.invalidOutput")
      .input(TestInput)
      .output(Schema.String.pipe(Schema.check(Schema.isMinLength(2))))
      .error(TestFailure)
      .handle(() => Effect.succeed("x"));
    const invalidFailure = new TestFailure({ reason: "temporarily valid" });
    Reflect.set(invalidFailure, "reason", 42);
    const invalidFailureOutput = makeGreeting().handle(() =>
      Effect.fail(invalidFailure)
    );

    await expect(defect.execute({ name: "Ada" })).rejects.toThrow();
    await expect(invalidOutput.execute({ name: "Ada" })).rejects.toThrow();
    await expect(
      invalidFailureOutput.execute({ name: "Ada" })
    ).rejects.toThrow();
  });
});
