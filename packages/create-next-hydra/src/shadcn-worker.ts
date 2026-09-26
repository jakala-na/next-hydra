import { NodeRuntime, NodeServices } from "@effect/platform-node";
import { Cause, Effect, FileSystem, Schema } from "effect";
import { addRegistryItems } from "shadcn/registry";

import { OutcomeJson, RequestJson } from "./shadcn-protocol.ts";
import type { Outcome } from "./shadcn-protocol.ts";

const main = Effect.gen(function* () {
  const fs = yield* FileSystem.FileSystem;
  const [requestPath, resultPath] = process.argv.slice(2);
  if (!requestPath || !resultPath) {
    return yield* Effect.die(new Error("Missing worker control paths"));
  }
  const result = yield* Effect.gen(function* () {
    const request = yield* fs
      .readFileString(requestPath)
      .pipe(Effect.flatMap(Schema.decodeEffect(RequestJson)));
    return yield* Effect.tryPromise({
      catch: (error) =>
        error instanceof Error
          ? error.message.slice(0, 8192)
          : "Registry operation failed",
      try: async () => {
        await addRegistryItems([...request.entries], {
          config: {},
          cwd: request.application,
          overwrite: request.overwrite,
          silent: true,
        });
      },
    }).pipe(
      Effect.match({
        onFailure: (diagnostic): typeof Outcome.Type => ({
          _tag: "RegistryFailure",
          diagnostic,
        }),
        onSuccess: (): typeof Outcome.Type => ({ _tag: "Success" }),
      })
    );
  }).pipe(
    Effect.catchCause((cause) =>
      Cause.hasInterrupts(cause)
        ? Effect.failCause(cause)
        : Effect.succeed<typeof Outcome.Type>({
            _tag: "WorkerDefect",
            diagnostic: Cause.pretty(cause).slice(0, 8192),
          })
    )
  );
  const encoded = yield* Schema.encodeEffect(OutcomeJson)(result);
  yield* fs.writeFileString(resultPath, encoded, { mode: 0o600 });
});

NodeRuntime.runMain(main.pipe(Effect.provide(NodeServices.layer)));
