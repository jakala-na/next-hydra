import "server-only";
import { NextServer } from "@repo/actions/next-server";
import type { NextRevalidationType } from "@repo/actions/next-server";
import { Effect, Layer } from "effect";
import { revalidatePath } from "next/cache";

export const nextServerLayer = Layer.succeed(NextServer, {
  revalidatePath: Effect.fn("NextServer.revalidatePath")(
    (path: string, type?: NextRevalidationType) =>
      Effect.sync(() => {
        if (type === undefined) {
          revalidatePath(path);
        } else {
          revalidatePath(path, type);
        }
      })
  ),
});
