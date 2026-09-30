import { Effect, Stream } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { ApplicationTaskFailed } from "./errors.ts";

export const executeLintCommand = Effect.fn("CompositionLint.execute")(
  function* (
    cwd: string,
    executable: string,
    args: readonly string[],
    accepted: readonly number[] = [0]
  ) {
    const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
    return yield* Effect.scoped(
      Effect.gen(function* () {
        const child = yield* processes.spawn(
          ChildProcess.make(executable, args, {
            cwd,
            env: {
              ...process.env,
              GIT_COMMON_DIR: undefined,
              GIT_DIR: undefined,
              GIT_INDEX_FILE: undefined,
              GIT_WORK_TREE: undefined,
            },
            stderr: "inherit",
            stdin: "ignore",
            stdout: "pipe",
          })
        );
        const [output, code] = yield* Effect.all(
          [Stream.mkString(Stream.decodeText(child.stdout)), child.exitCode],
          { concurrency: "unbounded" }
        );
        if (!accepted.includes(code)) {
          return yield* new ApplicationTaskFailed({ code, directory: cwd });
        }
        return output;
      })
    );
  }
);
