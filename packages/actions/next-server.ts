import type { Effect } from "effect";
import { Context } from "effect";

export type NextRevalidationType = "layout" | "page";

export class NextServer extends Context.Service<
  NextServer,
  {
    readonly refresh: () => Effect.Effect<void>;
    readonly revalidatePath: (
      path: string,
      type?: NextRevalidationType
    ) => Effect.Effect<void>;
  }
>()("@repo/actions/NextServer") {}
