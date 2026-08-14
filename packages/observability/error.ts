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
  } catch (newError) {
    // biome-ignore lint/suspicious/noConsole: Need console here
    console.error("Error parsing error:", newError);
  }

  return message;
};
