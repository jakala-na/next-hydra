import { NextServer } from "@repo/actions/next-server";
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { nextServerLayer } from "./next-server";

const next = vi.hoisted(() => ({
  revalidatePath:
    vi.fn<(path: string, type?: "layout" | "page") => undefined>(),
}));

vi.mock(import("server-only"), () => ({}));
vi.mock(import("next/cache"), () => ({
  revalidatePath: next.revalidatePath,
}));

describe("Next server adapter", () => {
  beforeEach(() => {
    next.revalidatePath.mockClear();
  });

  it("revalidates a path without inventing a cache type", async () => {
    await Effect.gen(function* revalidatePathWithoutType() {
      const server = yield* NextServer;
      yield* server.revalidatePath("/en-US/checkout");
    }).pipe(Effect.provide(nextServerLayer), Effect.runPromise);

    expect(next.revalidatePath).toHaveBeenCalledWith("/en-US/checkout");
  });

  it("forwards an explicit cache type", async () => {
    await Effect.gen(function* revalidatePathWithType() {
      const server = yield* NextServer;
      yield* server.revalidatePath("/en-US/checkout", "page");
    }).pipe(Effect.provide(nextServerLayer), Effect.runPromise);

    expect(next.revalidatePath).toHaveBeenCalledWith("/en-US/checkout", "page");
  });
});
