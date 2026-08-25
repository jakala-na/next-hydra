import type { Effect, Redacted } from "effect";
import { Context } from "effect";

export interface CurrentAuthSnapshot {
  readonly accessToken?: Redacted.Redacted;
  readonly permissions: readonly string[];
  readonly userId?: string;
}

/** Provider-neutral view of authentication needed by application services. */
export class CurrentAuth extends Context.Service<
  CurrentAuth,
  {
    readonly snapshot: Effect.Effect<CurrentAuthSnapshot>;
  }
>()("@repo/web/CurrentAuth") {}
