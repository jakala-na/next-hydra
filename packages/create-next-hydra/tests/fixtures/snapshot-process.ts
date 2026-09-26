import { Effect, Layer, Sink, Stream } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";

// Successful external Git transport for filesystem/dependency tests. This does
// not emulate a Git repository: persisted contents and Diff use real Git tests.
export const snapshotProcess = Layer.succeed(
  ChildProcessSpawner.ChildProcessSpawner,
  ChildProcessSpawner.make((command) => {
    if (command._tag !== "StandardCommand" || command.command !== "git") {
      return Effect.die(new Error("Expected private snapshot Git command"));
    }
    const operation = command.args.find((arg) =>
      [
        "init",
        "read-tree",
        "add",
        "write-tree",
        "commit-tree",
        "update-ref",
        "rev-parse",
      ].includes(arg)
    );
    if (!operation) {
      return Effect.die(new Error("Use real Git to test snapshot inspection"));
    }
    const output = ["write-tree", "commit-tree", "rev-parse"].includes(
      operation
    )
      ? `${"1".repeat(40)}\n`
      : "";
    return Effect.succeed(
      ChildProcessSpawner.makeHandle({
        all: Stream.empty,
        exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        pid: ChildProcessSpawner.ProcessId(2_147_483_647),
        stderr: Stream.empty,
        stdin: Sink.drain,
        stdout: Stream.make(new TextEncoder().encode(output)),
        unref: Effect.succeed(Effect.void),
      })
    );
  })
);
