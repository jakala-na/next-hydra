import "server-only";
import { ActionClient, ActionMiddleware } from "@repo/actions";
import type { EmptyActionContext } from "@repo/actions";
import type { Locale } from "@repo/i18n/types";
import { Effect } from "effect";

import { AppRuntime } from "./app-runtime";
import { NextRequestApi } from "./next-request";

export interface WebActionContext {
  readonly locale: Locale;
}

export const nextActionContext = ActionMiddleware.context<
  EmptyActionContext,
  WebActionContext,
  NextRequestApi
>(() =>
  NextRequestApi.pipe(
    Effect.flatMap((request) => request.getLocale()),
    Effect.map((locale) => ({ locale }))
  )
);

export const Actions = ActionClient.make(AppRuntime).use(nextActionContext);
