import { NodeRuntime } from "@effect/platform-node";
import { Console, Effect, Path, Schema } from "effect";

import {
  affectedLintWorkspaces,
  executeLintCommand,
  lintCompositions,
} from "./composition-lint.ts";
import type { CompositionLintScope } from "./composition-lint.ts";
import { InvalidComposition } from "./errors.ts";
import { runtime } from "./runtime.ts";
import { findSourceRoot } from "./source-root.ts";

const program = Effect.gen(function* () {
  const root = yield* findSourceRoot(process.cwd());
  const path = yield* Path.Path;
  const args = process.argv.slice(2);
  const selections = args.filter(
    (arg) => arg === "--source" || arg.startsWith("--workspace=")
  );
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const revisions = args.filter((arg) => arg.startsWith("--changed-from="));
  const invalid = args.filter(
    (arg) =>
      arg.startsWith("--") &&
      !["--staged", "--list", ...selections, ...revisions].includes(arg)
  );
  if (
    invalid.length > 0 ||
    selections.length > 1 ||
    selections.includes("--workspace=") ||
    revisions.length > 1 ||
    (revisions.length > 0 &&
      (args.includes("--staged") || positional.length > 0)) ||
    revisions.some(
      (arg) => !/^[a-f\d]{40,64}$/u.test(arg.slice("--changed-from=".length))
    ) ||
    (args.includes("--list") &&
      (selections.length > 0 || args.includes("--staged"))) ||
    (args.includes("--staged") && positional.length > 0)
  ) {
    return yield* new InvalidComposition({
      message:
        "Usage: lint-workspaces.js [--source | --workspace=<name>] [--staged | --changed-from=<commit-sha> | files...] or --list [--changed-from=<commit-sha> | files...]",
    });
  }
  const [selection] = selections;
  let scope: CompositionLintScope = { kind: "all" };
  if (selection === "--source") {
    scope = { kind: "source" };
  } else if (selection !== undefined) {
    scope = { kind: "workspace", name: selection.slice("--workspace=".length) };
  }
  const staged = args.includes("--staged");
  const revision = revisions[0]?.slice("--changed-from=".length);
  const files =
    staged || revision !== undefined
      ? (yield* executeLintCommand(root, "git", [
          "diff",
          ...(staged ? ["--cached"] : []),
          ...(args.includes("--list") ? ["--no-renames"] : []),
          "--name-only",
          args.includes("--list")
            ? "--diff-filter=ACMRD"
            : "--diff-filter=ACMR",
          "-z",
          ...(revision === undefined ? [] : [revision, "HEAD", "--"]),
        ]))
          .split("\0")
          .filter(Boolean)
      : positional.map((file) => path.relative(root, path.resolve(file)));
  if (args.includes("--list")) {
    const names = yield* affectedLintWorkspaces(
      root,
      revision !== undefined || positional.length > 0 ? files : undefined
    );
    yield* Console.log(
      yield* Schema.encodeEffect(
        Schema.fromJsonString(Schema.Array(Schema.String))
      )(names)
    );
    return;
  }
  yield* lintCompositions(
    root,
    staged || revision !== undefined || files.length > 0 ? files : undefined,
    scope
  );
});
NodeRuntime.runMain(program.pipe(Effect.provide(runtime)));
