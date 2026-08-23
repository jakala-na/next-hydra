import { NodePath } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import { Effect, Layer, Schema, Sink, Stdio, Stream } from "effect";
import { ChildProcessSpawner } from "effect/unstable/process";

import { ContentstackCli } from "./contentstack-cli";
import {
  contentstackCliLayer,
  retainDiagnosticTail,
} from "./contentstack-cli-live";

describe("Contentstack CLI diagnostics", () => {
  it("retains only the most recent 16 KiB of streamed output", () => {
    const tail = retainDiagnosticTail("a".repeat(16_384), "b".repeat(1024));

    expect(tail).toHaveLength(16_384);
    expect(tail).toBe(`${"a".repeat(15_360)}${"b".repeat(1024)}`);
  });

  it.effect("forwards streamed output through Effect Stdio", () => {
    const encoder = new TextEncoder();
    const decodeTextChunk = Schema.decodeUnknownSync(Schema.String);
    let stdout = "";
    let stderr = "";
    const append = (channel: "stderr" | "stdout") =>
      // oxlint-disable-next-line unicorn/no-array-for-each -- Effect Sink.forEach is not Array.prototype.forEach.
      Sink.forEach((chunk: string | Uint8Array) =>
        Effect.sync(() => {
          const text = decodeTextChunk(chunk);
          if (channel === "stdout") {
            stdout += text;
          } else {
            stderr += text;
          }
        })
      );
    const spawnerLayer = Layer.succeed(
      ChildProcessSpawner.ChildProcessSpawner,
      ChildProcessSpawner.make(() =>
        Effect.succeed(
          ChildProcessSpawner.makeHandle({
            all: Stream.empty,
            exitCode: Effect.succeed(ChildProcessSpawner.ExitCode(0)),
            getInputFd: () => Sink.drain,
            getOutputFd: () => Stream.empty,
            isRunning: Effect.succeed(false),
            kill: () => Effect.void,
            pid: ChildProcessSpawner.ProcessId(1),
            stderr: Stream.make(encoder.encode("migration stderr\n")),
            stdin: Sink.drain,
            stdout: Stream.make(encoder.encode("migration stdout\n")),
            unref: Effect.succeed(Effect.void),
          })
        )
      )
    );
    const stdioLayer = Stdio.layerTest({
      stderr: () => append("stderr"),
      stdout: () => append("stdout"),
    });
    const layer = contentstackCliLayer.pipe(
      Layer.provide(Layer.mergeAll(NodePath.layer, spawnerLayer, stdioLayer))
    );

    return Effect.gen(function* () {
      const cli = yield* ContentstackCli;

      yield* cli.runMigration({
        file: "migration.js",
        managementTokenAlias: "management-token",
      });

      expect(stdout).toBe("migration stdout\n");
      expect(stderr).toBe("migration stderr\n");
    }).pipe(Effect.provide(layer));
  });
});
