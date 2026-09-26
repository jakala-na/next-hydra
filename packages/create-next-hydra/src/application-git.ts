import { Effect, Redacted, Schema } from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import { confirmStopped, groupExists } from "./process-group.ts";

export class ApplicationGitFailed extends Schema.TaggedError<ApplicationGitFailed>()(
  "ApplicationGitFailed",
  { diagnostic: Schema.Redacted(Schema.Unknown), directory: Schema.String }
) {
  get message() {
    return `Git initialization failed in ${this.directory}. The composed application remains available for inspection.`;
  }
}

export const initializeApplicationGit = Effect.fn(
  "Workspaces.initializeApplicationGit"
)(function* (directory: string, commit: boolean) {
  const processes = yield* ChildProcessSpawner.ChildProcessSpawner;
  const git = (args: readonly string[]) =>
    Effect.scoped(
      Effect.uninterruptibleMask((restore) =>
        Effect.gen(function* () {
          const handle = yield* processes.spawn(
            ChildProcess.make("git", args, {
              cwd: directory,
              forceKillAfter: "100 millis",
              stderr: "ignore",
              stdin: "ignore",
              stdout: "ignore",
            })
          );
          return yield* restore(
            Effect.gen(function* () {
              const code = yield* handle.exitCode;
              if (yield* groupExists(handle.pid)) {
                return yield* new ApplicationGitFailed({
                  diagnostic: Redacted.make("Git left an active process"),
                  directory,
                });
              }
              return code;
            })
          ).pipe(
            Effect.onExit(() =>
              confirmStopped(handle).pipe(
                Effect.onExit(() => handle.unref.pipe(Effect.asVoid))
              )
            )
          );
        })
      )
    ).pipe(
      Effect.mapError(
        (error) =>
          new ApplicationGitFailed({
            diagnostic: Redacted.make(error),
            directory,
          })
      )
    );
  if ((yield* git(["init"])) !== 0) {
    return yield* new ApplicationGitFailed({
      diagnostic: Redacted.make("git init failed"),
      directory,
    });
  }
  if (!commit) {
    return { committed: false, initialized: true };
  }
  if ((yield* git(["add", "-A"])) !== 0) {
    return yield* new ApplicationGitFailed({
      diagnostic: Redacted.make("git add failed"),
      directory,
    });
  }
  const committed = (yield* git(["commit", "-m", "Initial commit"])) === 0;
  if (committed) {
    return { committed, initialized: true };
  }
  return {
    committed,
    initialized: true,
    warning:
      "Git was initialized, but the initial commit failed. Check your Git identity and hooks, then commit from the project directory.",
  };
});
