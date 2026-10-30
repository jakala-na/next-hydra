import { NodeServices } from "@effect/platform-node";
import { Cause, Console, Effect, Exit, Layer, Stdio } from "effect";
import * as TestConsole from "effect/testing/TestConsole";
import { describe, expect, it, vi } from "vitest";

import {
  CommandProgress,
  makeProgress,
  note,
  phase,
  renderReport,
  withCommandOutput,
} from "./command-output";

const step = { group: "CMS", title: "Configure the content index" };

function capture() {
  const events: string[] = [];
  const spinner = {
    text: "",
    start: () => {
      events.push("start");
    },
    stop: () => {
      events.push("stop");
    },
  };
  const output = makeProgress({
    style: { width: 80, color: false },
    write: (text) =>
      Effect.sync(() => {
        events.push(text);
      }),
    spinner: () => spinner,
  });
  return { events, spinner, output };
}

describe("command progress lifecycle", () => {
  it.each([
    { stdoutTty: true, stderrTty: false },
    { stdoutTty: false, stderrTty: true },
  ])(
    "styles receipt and progress independently with stdout=$stdoutTty and stderr=$stderrTty",
    async ({ stdoutTty, stderrTty }) => {
      const descriptor = Object.getOwnPropertyDescriptor(
        process.stderr,
        "isTTY"
      );
      Object.defineProperty(process.stderr, "isTTY", {
        configurable: true,
        value: stderrTty,
      });
      vi.stubEnv("TERM", "xterm");
      vi.stubEnv("NO_COLOR", "");
      vi.stubEnv("CI", "1");
      try {
        const output = await Effect.gen(function* () {
          yield* withCommandOutput(
            {
              title: "Set up search",
              context: "Review",
              failureNote: "Stopped",
            },
            (style) =>
              phase(step, Effect.void).pipe(
                Effect.andThen(
                  Console.log(
                    renderReport(
                      {
                        outcome: "ready",
                        summary: "Provisioned.",
                        sections: [],
                        tasks: [],
                      },
                      style
                    )
                  )
                )
              )
          );
          return {
            stdout: (yield* TestConsole.logLines).join("\n"),
            stderr: (yield* TestConsole.errorLines).join("\n"),
          };
        }).pipe(
          Effect.provide(
            Layer.mergeAll(
              NodeServices.layer,
              Stdio.layerTest({ stdoutIsTerminal: Effect.succeed(stdoutTty) }),
              TestConsole.layer
            )
          ),
          Effect.runPromise
        );
        expect(output.stdout.includes("\u001b[")).toBe(stdoutTty);
        expect(output.stderr.includes("\u001b[")).toBe(stderrTty);
        expect(output.stderr).toContain("Configure the content index");
      } finally {
        if (descriptor)
          Object.defineProperty(process.stderr, "isTTY", descriptor);
        else Reflect.deleteProperty(process.stderr, "isTTY");
        vi.unstubAllEnvs();
      }
    }
  );

  it("updates Ora without interleaved output and stops it before the durable completion", async () => {
    const { events, spinner, output } = capture();
    const value = await phase(
      step,
      note("Waiting for the provider").pipe(Effect.as(42))
    ).pipe(Effect.provideService(CommandProgress, output), Effect.runPromise);
    expect(value).toBe(42);
    expect(spinner.text).toBe("Waiting for the provider");
    expect(events).toEqual([
      "start",
      "stop",
      expect.stringContaining("OK  CMS"),
    ]);
  });

  it.each(["failure", "defect", "interruption"] as const)(
    "stops Ora and preserves %s without a success marker",
    async (kind) => {
      const { events, output } = capture();
      const error = new Error("provider unavailable");
      let operation: Effect.Effect<never, Error> = Effect.fail(error);
      if (kind === "defect") operation = Effect.die(error);
      if (kind === "interruption") operation = Effect.interrupt;
      const exit = await output
        .phase(step, operation)
        .pipe(Effect.runPromiseExit);
      expect(Exit.isFailure(exit)).toBe(true);
      if (Exit.isFailure(exit)) {
        expect(Cause.hasInterrupts(exit.cause)).toBe(kind === "interruption");
        expect(Cause.hasDies(exit.cause)).toBe(kind === "defect");
        if (kind === "failure") expect(Cause.squash(exit.cause)).toBe(error);
      }
      expect(events.slice(0, 2)).toEqual(["start", "stop"]);
      expect(events[2]).toContain(
        kind === "interruption" ? "CANCELLED" : "FAIL"
      );
      expect(events.join("\n")).not.toContain("OK");
    }
  );

  it("does not start a spinner around an interactive preflight", async () => {
    const { events, output } = capture();
    await output
      .phase({ ...step, interactive: true }, Effect.void)
      .pipe(Effect.runPromise);
    expect(events).toEqual([
      expect.stringContaining("WORKING"),
      expect.stringContaining("OK"),
    ]);
  });

  it("preserves commands in narrow, monochrome output", () => {
    const command = "ddev drush search-api:rebuild-tracker content";
    const text = renderReport(
      {
        outcome: "action-required",
        summary: "Content indexing requires your action.",
        sections: [],
        tasks: [
          {
            id: "cms.sync",
            title: "Start the initial content sync",
            where: "Drupal application root",
            detail:
              "Rebuild the tracker before indexing the published content.",
            commands: [command],
            verify: "Published records appear in Algolia.",
          },
        ],
      },
      { width: 36, color: false }
    );
    expect(text).toContain(`\n     $ ${command}\n`);
    expect(text).toContain("Your next steps");
    expect(text).not.toContain("\u001b");
  });
});
