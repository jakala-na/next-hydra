import { Effect, Layer, Option, Queue, Terminal } from "effect";
import type { Cause } from "effect";

export const terminalInput = (
  answer: "yes" | "no" | "cancel",
  onPrompt = Effect.void
) =>
  Layer.effect(
    Terminal.Terminal,
    Effect.gen(function* () {
      const input = yield* Effect.acquireRelease(
        Queue.make<Terminal.UserInput, Cause.Done>(),
        Queue.shutdown
      );
      return Terminal.make({
        columns: Effect.succeed(80),
        display: () => Effect.void,
        readInput: Effect.gen(function* () {
          yield* onPrompt;
          const key = answer === "yes" ? "y" : "n";
          yield* answer === "cancel"
            ? Queue.end(input)
            : Queue.offer(input, {
                input: Option.some(key),
                key: {
                  ctrl: false,
                  meta: false,
                  name: key,
                  shift: false,
                },
              });
          return Queue.asDequeue(input);
        }),
        readLine: Effect.die("Unexpected line input"),
        rows: Effect.succeed(24),
      });
    })
  );
