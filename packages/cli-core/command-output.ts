import { Cause, Console, Context, Effect, Exit, Stdio, Terminal } from "effect";
import ora from "ora";

import type { ProgressStep } from "./output-model";
import { renderIntro, renderPhase } from "./output-render";
import type { OutputStyle } from "./output-render";

export * from "./output-model";
export { renderReport } from "./output-render";

interface Progress {
  readonly phase: <A, E, R>(
    step: ProgressStep,
    operation: Effect.Effect<A, E, R>
  ) => Effect.Effect<A, E, R>;
  readonly note: (message: string) => Effect.Effect<void>;
}

interface Spinner {
  text: string;
  readonly start: () => unknown;
  readonly stop: () => unknown;
}

/** Leaf programs remain usable without a terminal or an output layer. */
export const CommandProgress = Context.Reference<Progress>(
  "@repo/cli-core/CommandProgress",
  {
    defaultValue: () => ({
      phase: (_step, operation) => operation,
      note: () => Effect.void,
    }),
  }
);

export const phase = <A, E, R>(
  step: ProgressStep,
  operation: Effect.Effect<A, E, R>
): Effect.Effect<A, E, R> =>
  Effect.flatMap(CommandProgress, (output) => output.phase(step, operation));

export const note = (message: string): Effect.Effect<void> =>
  Effect.flatMap(CommandProgress, (output) => output.note(message));

/** Sequential phases own Ora; child operations use note for details inside a phase. */
export function makeProgress(options: {
  readonly style: OutputStyle;
  readonly write: (text: string) => Effect.Effect<void>;
  readonly spinner?: (text: string) => Spinner;
}): Progress {
  let activeSpinner: Spinner | undefined;
  const run = <A, E, R>(
    step: ProgressStep,
    operation: Effect.Effect<A, E, R>
  ): Effect.Effect<A, E, R> => {
    const spinnerFactory = step.interactive ? undefined : options.spinner;
    const executing = Effect.scoped(
      Effect.gen(function* () {
        if (spinnerFactory) {
          yield* Effect.acquireRelease(
            Effect.sync(() => {
              const spinner = spinnerFactory(`${step.group} · ${step.title}`);
              spinner.start();
              activeSpinner = spinner;
              return spinner;
            }),
            (spinner) =>
              Effect.sync(() => {
                spinner.stop();
                activeSpinner = undefined;
              })
          );
        } else
          yield* options.write(renderPhase(step, "working", options.style));
        return yield* operation;
      })
    );
    return executing.pipe(
      Effect.onExit((exit) => {
        if (Exit.isSuccess(exit))
          return options.write(renderPhase(step, "done", options.style));
        const status = Cause.hasInterrupts(exit.cause) ? "cancelled" : "failed";
        return options.write(renderPhase(step, status, options.style));
      })
    );
  };
  return {
    phase: run,
    note: (message) =>
      Effect.suspend(() => {
        const spinner = activeSpinner;
        if (spinner)
          return Effect.sync(() => {
            spinner.text = message;
          });
        return options.write(`  ${message}`);
      }),
  };
}

export const withCommandOutput = <A, E, R>(
  options: {
    readonly title: string;
    readonly context: string;
    readonly failureNote: string;
  },
  program: (style: OutputStyle) => Effect.Effect<A, E, R>
) =>
  Effect.gen(function* () {
    const stdio = yield* Stdio.Stdio;
    const terminal = yield* Terminal.Terminal;
    const tty = yield* stdio.stdoutIsTerminal;
    const columns = yield* terminal.columns;
    const color = tty && !process.env.NO_COLOR && process.env.TERM !== "dumb";
    const style = { color, width: Math.max(36, Math.min(columns || 80, 88)) };
    const progressStyle = {
      ...style,
      color:
        Boolean(process.stderr.isTTY) &&
        !process.env.NO_COLOR &&
        process.env.TERM !== "dumb",
    };
    const output = makeProgress({
      style: progressStyle,
      write: (text) => Console.error(text),
      spinner:
        progressStyle.color && !process.env.CI
          ? (text) =>
              ora({
                text,
                stream: process.stderr,
                discardStdin: false,
                color: "cyan",
              })
          : undefined,
    });
    yield* Console.error(
      renderIntro(options.title, options.context, progressStyle)
    );
    return yield* program(style).pipe(
      Effect.provideService(CommandProgress, output),
      Effect.onExit((exit) => {
        if (Exit.isSuccess(exit)) return Effect.void;
        const status = Cause.hasInterrupts(exit.cause)
          ? "CANCELLED"
          : "STOPPED";
        return Console.error(
          `\n${status}  ${options.title}\n  ${options.failureNote}\n`
        );
      })
    );
  });
