import { Context } from "effect";
import type { Effect } from "effect";

export type NextRevalidationType = "layout" | "page";

export class NextServer extends Context.Service<
  NextServer,
  {
    readonly revalidatePath: (
      path: string,
      type?: NextRevalidationType
    ) => Effect.Effect<void>;
  }
>()("@repo/actions/NextServer") {}
