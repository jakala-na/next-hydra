import { Option, Schema } from "effect";

const ErrorDetails = Schema.Struct({
  cause: Schema.optionalKey(Schema.Unknown),
  code: Schema.optionalKey(Schema.String),
  message: Schema.optionalKey(Schema.String),
  status: Schema.optionalKey(Schema.Finite),
  statusCode: Schema.optionalKey(Schema.Finite),
});

export const decodeErrorDetails = (cause: unknown) =>
  Option.getOrUndefined(Schema.decodeUnknownOption(ErrorDetails)(cause));

export const decodedErrorMessage = (cause: unknown) =>
  Option.getOrUndefined(Schema.decodeUnknownOption(Schema.String)(cause)) ??
  decodeErrorDetails(cause)?.message;

export const providerErrorSummary = (cause: unknown): string | undefined => {
  const details = decodeErrorDetails(cause);
  const message = decodedErrorMessage(cause);
  const status = details?.statusCode ?? details?.status;
  const label = [status, details?.code]
    .filter((part) => part !== undefined)
    .join(" ");

  if (label.length === 0) {
    return message;
  }
  return message === undefined ? label : `${label}: ${message}`;
};
