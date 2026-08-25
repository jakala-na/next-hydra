import "server-only";
import { NextServer } from "@repo/actions/next-server";
import type { NextRevalidationType } from "@repo/actions/next-server";
import { Effect, Layer } from "effect";
import { refresh, revalidatePath } from "next/cache";

export type NextServerAdapters = {
  readonly refresh: () => void;
  readonly revalidatePath: (path: string, type?: NextRevalidationType) => void;
};

export const nextServerLayerFrom = (
  adapters: NextServerAdapters
): Layer.Layer<NextServer> =>
  Layer.succeed(NextServer, {
    refresh: Effect.fn("NextServer.refresh")(() =>
      Effect.sync(() => {
        adapters.refresh();
      })
    ),
    revalidatePath: Effect.fn("NextServer.revalidatePath")(
      (path: string, type?: NextRevalidationType) =>
        Effect.sync(() => {
          if (type === undefined) {
            adapters.revalidatePath(path);
          } else {
            adapters.revalidatePath(path, type);
          }
        })
    ),
  });

export const nextServerLayer = nextServerLayerFrom({
  refresh,
  revalidatePath,
});
