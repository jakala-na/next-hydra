// THROWAWAY: evaluates terminal output, using only public Effect rc.117 APIs.
import { runMain } from "@effect/platform-node/NodeRuntime";
import { layer } from "@effect/platform-node/NodeServices";
import { Effect, Stdio, Terminal } from "effect";
import { Command, Flag, Prompt } from "effect/unstable/cli";

import { scenarioNames, scenarios } from "./output-fixtures.ts";
import { progress } from "./output-progress.ts";
import { intro, phase, result, variantNames, wrap } from "./output-render.ts";
import type { Style } from "./output-render.ts";

const simulatePhase = Effect.fn("OutputPrototype.phase")(function* (
  text: string,
  animated: boolean,
  instant: boolean,
  style: Style,
  index: number,
  total: number
) {
  if (!animated) {
    if (!instant) {
      yield* Effect.sleep("650 millis");
    }
    return;
  }
  yield* Effect.scoped(
    Effect.gen(function* () {
      yield* Effect.acquireRelease(
        Effect.sync(() => progress(text, index, total, style).start()),
        (spinner) =>
          Effect.sync(() => {
            spinner.stop();
          })
      );
      yield* Effect.sleep("650 millis");
    })
  );
});

const command = Command.make(
  "output-prototype",
  {
    color: Flag.Literals("color", ["auto", "always", "never"]).pipe(
      Flag.withDefault("auto")
    ),
    instant: Flag.Boolean("instant").pipe(
      Flag.withDefault(false),
      Flag.withDescription("Skip simulated delays and animation")
    ),
    onboarding: Flag.Boolean("onboarding").pipe(
      Flag.withDefault(false),
      Flag.withDescription(
        "Show an Effect destination prompt between simulated search steps"
      )
    ),
    scenario: Flag.Literals("scenario", scenarioNames).pipe(
      Flag.withDefault("search")
    ),
    variant: Flag.Literals("variant", variantNames).pipe(
      Flag.withDefault("journal")
    ),
    width: Flag.Int("width").pipe(
      Flag.withDefault(0),
      Flag.withDescription("Prose width; 0 uses terminal width, capped at 88")
    ),
  },
  ({ variant, scenario: name, color, instant, onboarding, width }) =>
    Effect.gen(function* () {
      const terminal = yield* Terminal.Terminal;
      const stdio = yield* Stdio.Stdio;
      const tty = yield* stdio.stdoutIsTerminal;
      const inputTty = yield* stdio.stdinIsTerminal;
      const columns = yield* terminal.columns;
      const noColor =
        Boolean(process.env.NO_COLOR) || process.env.TERM === "dumb";
      const style: Style = {
        color: !noColor && (color === "always" || (color === "auto" && tty)),
        width:
          width > 0
            ? Math.max(36, width)
            : Math.max(36, Math.min(columns || 80, 88)),
      };
      let scenario =
        scenarios[onboarding && name === "search" ? "search-installed" : name];
      yield* terminal.display(intro(scenario, variant, style));
      yield* Effect.gen(function* () {
        for (let index = 0; index < scenario.phases.length; index += 1) {
          const currentPhase = scenario.phases[index];
          if (currentPhase === undefined) {
            continue;
          }
          const choosingDestination =
            onboarding && name.startsWith("search") && index === 0;
          const text = choosingDestination
            ? "Check the workspace and required configuration"
            : currentPhase;
          // No rewrites in pipes, monochrome mode, or the dry-run fixture.
          if (!tty && !instant) {
            yield* terminal.display(
              `${wrap(`Working: ${text}`, "  ", style)}\n`
            );
          }
          yield* simulatePhase(
            text,
            tty && style.color && !process.env.CI && !instant,
            instant,
            style,
            index,
            scenario.phases.length
          );
          yield* terminal.display(
            phase(
              text,
              index,
              scenario.phases.length,
              scenario.outcome === "failed" &&
                index === scenario.phases.length - 1,
              variant,
              style
            )
          );
          if (choosingDestination) {
            yield* terminal.display("\n");
            // The Ora scope has already closed before Effect owns the input.
            let destination: "search-installed" | "search-vercel" =
              name === "search-vercel" ? "search-vercel" : "search-installed";
            if (tty && inputTty && !instant) {
              destination = yield* Prompt.Select({
                choices: [
                  {
                    title: "Private local file",
                    value: "search-installed",
                    description: "apps/cli/.env.search.local",
                  },
                  {
                    title: "Vercel Preview",
                    value: "search-vercel",
                    description: "Linked web project",
                  },
                ],
                message: "Where should search credentials go?",
              });
            }
            scenario = scenarios[destination];
            yield* terminal.display(
              `${wrap(
                `Destination: ${destination === "search-vercel" ? "Vercel Preview" : "Private local file"}`,
                "  ",
                style
              )}\n\n`
            );
          }
        }
        yield* terminal.display(result(scenario, variant, style));
      }).pipe(
        Effect.onInterrupt(() =>
          terminal.display(
            "\nCANCELLED  Output simulation stopped. No external changes were made.\n"
          )
        )
      );
    })
).pipe(
  Command.withDescription(
    "Simulate phased CLI output and action handoffs. No external services are called."
  )
);

runMain(
  Command.run(command, { version: "0.0.0-prototype" }).pipe(
    Effect.provide(layer)
  )
);
