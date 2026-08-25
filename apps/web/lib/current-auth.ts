import "server-only";
import { withAuth } from "@repo/auth/server";
import { Effect, Layer, Redacted } from "effect";

import { CurrentAuth } from "./current-auth-api";
import type { CurrentAuthSnapshot } from "./current-auth-api";

export type { CurrentAuthSnapshot } from "./current-auth-api";
export { CurrentAuth } from "./current-auth-api";

export const currentAuthLayer = Layer.succeed(CurrentAuth, {
  snapshot: Effect.promise(async () => await withAuth()).pipe(
    Effect.map((session): CurrentAuthSnapshot => {
      const snapshot: CurrentAuthSnapshot = {
        permissions: session.permissions ?? [],
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
    })
  ),
});
