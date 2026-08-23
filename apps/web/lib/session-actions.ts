import "server-only";
import { ActionMiddleware } from "@repo/actions";
import { Effect } from "effect";

import { Actions } from "./actions";
import type { WebActionContext } from "./actions";
import { CurrentAuth, terminateAuthSessionReadFailure } from "./current-auth";
import type { CurrentAuthSnapshot } from "./current-auth";

export interface WebSessionActionContext extends WebActionContext {
  readonly session: CurrentAuthSnapshot;
}

export const currentSessionContext = ActionMiddleware.context<
  WebActionContext,
  { readonly session: CurrentAuthSnapshot },
  CurrentAuth
>(() =>
  CurrentAuth.pipe(
    Effect.flatMap((currentAuth) => currentAuth.snapshot),
    Effect.map((session) => ({ session })),
    Effect.catchTag("AuthSessionReadFailure", terminateAuthSessionReadFailure)
  )
);

// oxlint-disable-next-line react-hooks/rules-of-hooks -- ActionClient.use composes action middleware; it is not a React Hook.
export const SessionActions = Actions.use(currentSessionContext);
