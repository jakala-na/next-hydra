import { NodeRuntime } from "@effect/platform-node";
import { Console, Effect, Path } from "effect";

import {
  prepareApplicationTypes,
  typecheckApplication,
} from "./application-typecheck.ts";
import { InvalidComposition } from "./errors.ts";
import { runtime } from "./runtime.ts";
import { findSourceRoot } from "./source-root.ts";
import { Workspaces } from "./workspaces.ts";

const program = Effect.gen(function* () {
  const [name, ...extra] = process.argv.slice(2);
  if (!name || extra.length > 0) {
    return yield* new InvalidComposition({
      message: "Usage: workspace:check <named-workspace>",
    });
  }
  const sourceRoot = yield* findSourceRoot(process.cwd());
  const path = yield* Path.Path;
  const workspace = yield* (yield* Workspaces).named({ name, sourceRoot });
  const before = yield* workspace.check;
  if (!before.ready) {
    return yield* new InvalidComposition({
      message: `Compose ${name} and install its dependencies before checking generated code.`,
    });
  }
  const destination = path.join(sourceRoot, "workspaces", name);
  yield* prepareApplicationTypes(destination);
  const after = yield* workspace.check;
  if (!after.ready) {
    return yield* new InvalidComposition({
      message: `Workspace ${name} changed during type generation.`,
    });
  }
  const { files: origins } = yield* workspace.explain();
  for (const directory of ["apps/web", "apps/cli", "tests/e2e"]) {
    const expected = origins
      .filter(
        (file) =>
          file.origin.kind === "template" &&
          (file.target.startsWith(`${directory}/`) ||
            (directory === "apps/web" && file.target.startsWith("packages/")))
      )
      .map((file) => path.join(destination, file.target));
    yield* typecheckApplication(
      path.join(destination, directory, "tsconfig.json"),
      expected
    );
    yield* Console.log(`PASS: ${name}: ${directory} full typecheck`);
  }
});
NodeRuntime.runMain(program.pipe(Effect.provide(runtime)));
