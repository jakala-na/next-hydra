import {
  captureSentryRequestError,
  initializeSentry,
} from "@repo/observability/instrumentation";

export const register = initializeSentry;
export const onRequestError = captureSentryRequestError;
