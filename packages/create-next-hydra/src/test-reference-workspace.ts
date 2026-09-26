import { NodeRuntime } from "@effect/platform-node";
import { Effect } from "effect";

import { testReferenceWorkspace } from "./reference-workspace.ts";
import { runtime } from "./runtime.ts";
import { findSourceRoot } from "./source-root.ts";

NodeRuntime.runMain(
  findSourceRoot(process.cwd()).pipe(
    Effect.flatMap(testReferenceWorkspace),
    Effect.provide(runtime)
  )
);
