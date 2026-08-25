import { NextServer } from "@repo/actions/next-server";
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { nextServerLayerFrom } from "./next-server";

describe("Next server adapter", () => {
  it("refreshes the current route", async () => {
    const calls: string[] = [];

    await Effect.gen(function* refreshCurrentRoute() {
      const server = yield* NextServer;
      yield* server.refresh();
    }).pipe(
      Effect.provide(
        nextServerLayerFrom({
          refresh: () => {
            calls.push("refresh");
          },
          revalidatePath: () => {
            /* unused */
          },
        })
      ),
      Effect.runPromise
    );

    expect(calls).toStrictEqual(["refresh"]);
  });

  it("revalidates a path without inventing a cache type", async () => {
    const paths: { path: string; type?: string }[] = [];

    await Effect.gen(function* revalidatePathWithoutType() {
      const server = yield* NextServer;
      yield* server.revalidatePath("/en-US/checkout");
    }).pipe(
      Effect.provide(
        nextServerLayerFrom({
          refresh: () => {
            /* unused */
          },
          revalidatePath: (path, type) => {
            paths.push(type === undefined ? { path } : { path, type });
          },
        })
      ),
      Effect.runPromise
    );

    expect(paths).toStrictEqual([{ path: "/en-US/checkout" }]);
  });

  it("forwards an explicit cache type", async () => {
    const paths: { path: string; type?: string }[] = [];

    await Effect.gen(function* revalidatePathWithType() {
      const server = yield* NextServer;
      yield* server.revalidatePath("/en-US/checkout", "page");
    }).pipe(
      Effect.provide(
        nextServerLayerFrom({
          refresh: () => {
            /* unused */
          },
          revalidatePath: (path, type) => {
            paths.push(type === undefined ? { path } : { path, type });
          },
        })
      ),
      Effect.runPromise
    );

    expect(paths).toStrictEqual([{ path: "/en-US/checkout", type: "page" }]);
  });
});
