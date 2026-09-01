import "server-only";
import { AuthSessionAdapter, authSessionAdapterLayer } from "@repo/auth/server";
import { Effect } from "effect";

import { currentAuthLayerFromSessionRead } from "./current-auth-api";

export type { CurrentAuthSnapshot } from "./current-auth-api";
export {
  CurrentAuth,
  terminateAuthSessionReadFailure,
} from "./current-auth-api";

const currentAuthSnapshot = AuthSessionAdapter.read.pipe(
  Effect.provide(authSessionAdapterLayer)
);

export const currentAuthLayer =
  currentAuthLayerFromSessionRead(currentAuthSnapshot);
