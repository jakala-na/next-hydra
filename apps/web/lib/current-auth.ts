import "server-only";
import { withAuth } from "@repo/auth/server";
import { Context, Effect, Layer, Redacted } from "effect";

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

export const currentAuthLayer = Layer.succeed(CurrentAuth, {
  snapshot: Effect.promise(async () => await withAuth()).pipe(
    Effect.map((session) => ({
      permissions: session.permissions ?? [],
      ...(session.accessToken === undefined
        ? {}
        : { accessToken: Redacted.make(session.accessToken) }),
      ...(session.user?.id === undefined ? {} : { userId: session.user.id }),
    }))
  ),
});
