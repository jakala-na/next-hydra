/* oxlint-disable promise/prefer-await-to-callbacks -- Effect combinators use callback APIs to transform Effects. */
import type {
  AuthPermissionAdapter,
  AuthSession,
  AuthSessionReadFailure,
} from "@repo/auth/server";
import { Context, Effect, Layer, Redacted } from "effect";

export interface CurrentAuthSnapshot {
  readonly accessToken?: Redacted.Redacted;
  readonly permissions: AuthPermissionAdapter;
  readonly userId?: string;
}

/** Provider-neutral view of authentication needed by application services. */
export class CurrentAuth extends Context.Service<
  CurrentAuth,
  {
    readonly snapshot: Effect.Effect<
      CurrentAuthSnapshot,
      AuthSessionReadFailure
    >;
  }
>()("@repo/web/CurrentAuth") {}

const toCurrentAuthSnapshot = (session: AuthSession): CurrentAuthSnapshot => {
  const snapshot: CurrentAuthSnapshot = {
    permissions: session.permissions,
  };
  if (session.accessToken !== undefined) {
    Object.assign(snapshot, {
      accessToken: Redacted.make(session.accessToken),
    });
  }
  if (session.user?.id !== undefined) {
    Object.assign(snapshot, { userId: session.user.id });
  }
  return snapshot;
};

export const currentAuthLayerFromSessionRead = (
  readSession: Effect.Effect<AuthSession, AuthSessionReadFailure>
) =>
  Layer.succeed(CurrentAuth, {
    snapshot: readSession.pipe(Effect.map(toCurrentAuthSnapshot)),
  });

export const terminateAuthSessionReadFailure = Effect.fn(
  "CurrentAuth.terminateSessionReadFailure"
)(function* (error: AuthSessionReadFailure) {
  yield* Effect.logError(error.message, error.cause).pipe(
    Effect.annotateLogs({
      "auth.provider": error.provider,
      "auth.session.error.tag": error._tag,
    })
  );

  return yield* Effect.die(error);
});
