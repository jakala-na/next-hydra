import { NodeRuntime } from "@effect/platform-node";
import { Effect, Path } from "effect";

import { executeLintCommand, lintCompositions } from "./composition-lint.ts";
import { runtime } from "./runtime.ts";
import { findSourceRoot } from "./source-root.ts";

const program = Effect.gen(function* () {
  const root = yield* findSourceRoot(process.cwd());
  const path = yield* Path.Path;
  const args = process.argv.slice(2);
  const staged = args.includes("--staged");
  const files = staged
    ? (yield* executeLintCommand(root, "git", [
        "diff",
        "--cached",
        "--name-only",
        "--diff-filter=ACMR",
        "-z",
      ]))
        .split("\0")
        .filter(Boolean)
    : args.map((file) => path.relative(root, path.resolve(file)));
  yield* lintCompositions(root, staged || files.length > 0 ? files : undefined);
});
NodeRuntime.runMain(program.pipe(Effect.provide(runtime)));
