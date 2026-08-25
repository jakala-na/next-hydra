const TRANSIENT_TRANSPORT_CODES = new Set([
  "EAI_AGAIN",
  "ECONNREFUSED",
  "ENETUNREACH",
  "UND_ERR_CONNECT_TIMEOUT",
  "ECONNABORTED",
  "ECONNRESET",
  "ETIMEDOUT",
  "UND_ERR_BODY_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET",
]);
const DEFAULT_CAUSE_DEPTH = 2;
const NO_CAUSE_DEPTH_REMAINING = 0;
const NEXT_CAUSE_DEPTH = 1;

const errorCode = (value: unknown) =>
  typeof value === "object" &&
  value !== null &&
  "code" in value &&
  typeof value.code === "string"
    ? value.code
    : undefined;

const nestedCause = (value: unknown) =>
  typeof value === "object" && value !== null && "cause" in value
    ? ({ found: true, value: value.cause } as const)
    : ({ found: false } as const);

const hasErrorCode = (
  cause: unknown,
  codes: ReadonlySet<string>,
  remainingCauseDepth: number
): boolean => {
  const code = errorCode(cause);
  if (code !== undefined && codes.has(code)) {
    return true;
  }

  const innerCause = nestedCause(cause);
  return !innerCause.found || remainingCauseDepth === NO_CAUSE_DEPTH_REMAINING
    ? false
    : hasErrorCode(
        innerCause.value,
        codes,
        remainingCauseDepth - NEXT_CAUSE_DEPTH
      );
};

/**
 * Detects positive, code-level evidence of a transient transport failure.
 * Error classes such as `TypeError` are deliberately insufficient because
 * application bugs and invalid configuration can throw the same class.
 */
export const hasTransientTransportCode = (
  cause: unknown,
  additionalCodes: readonly string[] = [],
  remainingCauseDepth = DEFAULT_CAUSE_DEPTH
) =>
  hasErrorCode(
    cause,
    new Set([...TRANSIENT_TRANSPORT_CODES, ...additionalCodes]),
    remainingCauseDepth
  );
