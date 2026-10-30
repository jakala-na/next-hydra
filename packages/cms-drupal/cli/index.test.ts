import { NodeServices } from "@effect/platform-node";
import { Effect, Exit, Sink, Stdio, Stream } from "effect";
import { TestConsole } from "effect/testing";
import { Command } from "effect/unstable/cli";
import { ChildProcessSpawner } from "effect/unstable/process";
import { describe, expect, it } from "vitest";

import { createCmsCommand } from "./index";

describe("Drupal provision command output", () => {
  it.each([0, 1])(
    "reports installer exit %i without invoking a real DDEV process",
    async (exitCode) => {
      const commands: string[] = [];
      const processes = ChildProcessSpawner.make((command) => {
        if (command._tag !== "StandardCommand")
          return Effect.die("Expected one installer command");
        commands.push(`${command.command} ${command.args.join(" ")}`);
        return Effect.succeed(
          ChildProcessSpawner.makeHandle({
            all: Stream.empty,
            stdout: Stream.empty,
            stderr: Stream.empty,
            stdin: Sink.drain,
            getInputFd: () => Sink.drain,
            getOutputFd: () => Stream.empty,
            isRunning: Effect.succeed(false),
            kill: () => Effect.void,
            pid: ChildProcessSpawner.ProcessId(1),
            unref: Effect.succeed(Effect.void),
            exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(exitCode)),
          })
        );
      });
      const output = await Effect.gen(function* () {
        const exit = yield* Command.runWith(
          createCmsCommand(Effect.die("No CMS configuration reads expected")),
          { version: "0.0.0" }
        )(["provision", "--app-directory", "/application/drupal"]).pipe(
          Effect.exit
        );
        return {
          exit,
          stdout: (yield* TestConsole.logLines).join("\n"),
          stderr: (yield* TestConsole.errorLines).join("\n"),
        };
      }).pipe(
        Effect.provideService(
          ChildProcessSpawner.ChildProcessSpawner,
          processes
        ),
        Effect.provide(NodeServices.layer),
        Effect.provide(TestConsole.layer),
        Effect.provide(
          Stdio.layerTest({ stdoutIsTerminal: Effect.succeed(false) })
        ),
        Effect.runPromise
      );
      expect(commands).toEqual(["ddev install"]);
      expect(Exit.isSuccess(output.exit)).toBe(exitCode === 0);
      if (exitCode === 0) {
        expect(output.stdout).toContain("┌─ CMS · Drupal");
        expect(output.stdout).toContain("/application/drupal");
        expect(output.stderr).toContain("OK  CMS");
      } else {
        expect(output.stdout).not.toContain("┌─ CMS");
        expect(output.stderr).toContain("FAIL  CMS");
        expect(output.stderr).toContain("STOPPED");
      }
    }
  );
});
