import { Effect, FileSystem, Path } from "effect";

import { InvalidComposition } from "./errors.ts";
import type { PreparedFile } from "./model.ts";

export const relativeFile = (
  input: string
): Effect.Effect<string, InvalidComposition> => {
  const value = input.startsWith("~/") ? input.slice(2) : input;
  return value.length === 0 ||
    value
      .split("/")
      .some((part) => ["", ".", "..", ".git", "node_modules"].includes(part)) ||
    /[:\\]/u.test(value) ||
    value.includes(String.fromCodePoint(0))
    ? Effect.fail(
        new InvalidComposition({
          message: `Expected a workspace-relative file: ${input}`,
        })
      )
    : Effect.succeed(value);
};

export const writeFile = Effect.fn("Composition.writeFile")(function* (
  root: string,
  file: PreparedFile,
  exclusive?: boolean
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const target = path.join(root, yield* relativeFile(file.target));
  // Join each mutation before its storage owner can release the directory.
  yield* fs
    .makeDirectory(path.dirname(target), { recursive: true })
    .pipe(Effect.uninterruptible);
  yield* fs
    .writeFile(target, file.content, {
      flag: exclusive === true ? "wx" : "w",
      mode: file.mode,
    })
    .pipe(Effect.uninterruptible);
  yield* fs.chmod(target, file.mode).pipe(Effect.uninterruptible);
});

export const collectFiles = Effect.fn("Composition.collectFiles")(function* (
  root: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const files: PreparedFile[] = [];
  const pending = [""];
  while (pending.length > 0) {
    const directory = pending.pop();
    if (directory === undefined) {
      break;
    }
    for (const name of yield* fs
      .readDirectory(path.join(root, directory))
      .pipe(Effect.uninterruptible)) {
      const target = directory ? `${directory}/${name}` : name;
      const absolute = path.join(root, target);
      const stat = yield* fs.stat(absolute).pipe(Effect.uninterruptible);
      if (stat.type === "Directory") {
        pending.push(target);
      } else if (stat.type === "File") {
        files.push({
          content: yield* fs.readFile(absolute).pipe(Effect.uninterruptible),
          mode: stat.mode % 0o1000,
          target,
        });
      } else {
        return yield* new InvalidComposition({
          message: `Unsupported materialized entry: ${target}`,
        });
      }
    }
  }
  return files;
});
