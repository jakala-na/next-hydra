import { captureRequestError, init } from "@sentry/nextjs";
import { keys } from "./keys";

const isDevelopment = process.env.NODE_ENV === "development";

const opts = {
  dsn: keys().NEXT_PUBLIC_SENTRY_DSN,
  enableLogs: isDevelopment,
  spotlight: isDevelopment,
  tracesSampleRate: isDevelopment ? 1 : undefined,
} satisfies Parameters<typeof init>[0];

export const initializeSentry = () => {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    init(opts);
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    init(opts);
  }
};

export const captureSentryRequestError = captureRequestError;
