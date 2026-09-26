import { Effect, FileSystem, Path } from "effect";

import { InvalidComposition } from "./errors.ts";

export const findSourceRoot = Effect.fn("WorkspaceSources.findRoot")(function* (
  cwd: string
) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  let candidate = path.resolve(cwd);
  while (true) {
    if (
      (yield* fs.exists(path.join(candidate, "registry.json"))) &&
      (yield* fs.exists(path.join(candidate, "pnpm-workspace.yaml")))
    ) {
      return candidate;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      return yield* new InvalidComposition({
        message:
          "Run workspace commands inside a source checkout containing registry.json and pnpm-workspace.yaml.",
      });
    }
    candidate = parent;
  }
});
