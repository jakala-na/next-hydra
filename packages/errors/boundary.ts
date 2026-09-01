import { Schema } from "effect";

const PublicErrorSummary = Schema.Struct({
  _tag: Schema.String,
  code: Schema.String,
  message: Schema.String,
});

/**
 * Normalizes an unknown rejection or defect for JavaScript framework
 * boundaries while preserving the original value as the cause.
 */
export const toError = (cause: unknown, fallbackMessage: string): Error => {
  if (cause instanceof Error) {
    if (cause.message !== "") {
      return cause;
    }

    const error = new Error(fallbackMessage, { cause });
    error.name = cause.name;
    return error;
  }

  if (Schema.is(PublicErrorSummary)(cause)) {
    const error = new Error(`[${cause.code}] ${cause.message}`, { cause });
    error.name = cause._tag;
    return error;
  }

  return new Error(fallbackMessage, { cause });
};
