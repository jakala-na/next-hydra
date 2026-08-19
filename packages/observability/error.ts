import { captureException as captureSentryException } from "@sentry/nextjs";

import { log } from "./log";

export const captureException = (error: unknown): void => {
  captureSentryException(error);
};

export const parseError = (error: unknown): string => {
  let message = "An error occurred";

  if (error instanceof Error) {
    ({ message } = error);
  } else if (error && typeof error === "object" && "message" in error) {
    const { message: errorMessage } = error;
    message = errorMessage as string;
  } else {
    message = String(error);
  }

  try {
    captureException(error);
    log.error(`Parsing error: ${message}`);
    // Shadows parseError's `error` param; catch bindings stay named `error`.
    // oxlint-disable-next-line eslint/no-shadow
  } catch (error) {
    // oxlint-disable-next-line no-console -- This fallback must report through the console.
    console.error("Error parsing error:", error);
  }

  return message;
};
