import { Effect, FileSystem, Path, Redacted } from "effect";

import {
  EnvironmentInitializationFailed,
  InvalidComposition,
} from "./errors.ts";
import { isEnvironmentFile } from "./file-policy.ts";
import { relativeFile } from "./files.ts";
import type { PreparedFile } from "./model.ts";
import type { LocalEnvironmentFile } from "./source-inventory.ts";
import type { WorkspaceWriteAccess } from "./workspace-state.ts";

export const planEnvironmentCopy = Effect.fn("Workspaces.planEnvironmentCopy")(
  function* (
    destination: string,
    files: readonly PreparedFile[],
    local: readonly LocalEnvironmentFile[]
  ) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const directories = new Set(["."]);
    for (const file of files) {
      let directory = path.dirname(file.target);
      while (directory !== ".") {
        directories.add(directory);
        directory = path.dirname(directory);
      }
    }
    const pending: LocalEnvironmentFile[] = [];
    for (const file of local) {
      const target = yield* relativeFile(file.target);
      if (!isEnvironmentFile(target)) {
        return yield* new InvalidComposition({
          message: `Not an environment file: ${target}`,
        });
      }
      if (!directories.has(path.dirname(target))) {
        continue;
      }
      const absolute = path.join(destination, target);
      if (yield* fs.exists(absolute)) {
        if ((yield* fs.stat(absolute)).type !== "File") {
          return yield* new InvalidComposition({
            message: `Environment target is not a file: ${file.target}`,
          });
        }
        continue;
      }
      if ((yield* fs.stat(file.source)).type !== "File") {
        return yield* new InvalidComposition({
          message: `Environment source is not a file: ${file.target}`,
        });
      }
      pending.push(file);
    }
    return pending;
  }
);

export const copyEnvironment = Effect.fn("Workspaces.copyEnvironment")(
  function* (
    destination: string,
    inputs: readonly LocalEnvironmentFile[],
    initialize?: WorkspaceWriteAccess["initialize"]
  ) {
    const fs = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const created: string[] = [];
    for (const file of inputs) {
      const target = path.join(destination, file.target);
      const copy = Effect.gen(function* () {
        if (yield* fs.exists(target)) {
          if ((yield* fs.stat(target)).type === "File") {
            return;
          }
          return yield* new InvalidComposition({
            message: `Environment target is not a file: ${file.target}`,
          });
        }
        yield* fs.makeDirectory(path.dirname(target), { recursive: true });
        const content = yield* fs.readFile(file.source);
        const written = yield* fs
          .writeFile(target, content, { flag: "wx", mode: 0o600 })
          .pipe(
            Effect.as(true),
            Effect.catchIf(
              (error) => error.reason._tag === "AlreadyExists",
              (error) =>
                fs
                  .stat(target)
                  .pipe(
                    Effect.flatMap((stat) =>
                      stat.type === "File"
                        ? Effect.succeed(false)
                        : Effect.fail(error)
                    )
                  )
            )
          );
        if (written) {
          created.push(file.target);
        }
      }).pipe(
        Effect.uninterruptible,
        Effect.mapError(
          (error) =>
            new EnvironmentInitializationFailed({
              createdFiles: [...created],
              diagnostic: Redacted.make(error),
              directory: destination,
              failedFile: file.target,
            })
        )
      );
      yield* initialize ? initialize(file.target, copy) : copy;
    }
    return created;
  }
);
