export type ErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'BAD_INPUT'
  | 'NETWORK_ERROR'
  | 'UNKNOWN';

export type DomainError<TDetails = unknown> = {
  type: 'DomainError';
  code: ErrorCode;
  message: string; // developer-readable, not necessarily shown to end user
  details?: TDetails; // extra context (ids, constraint names, etc.)
  cause?: unknown; // raw low-level error for logging
};
export const domainError = <D = unknown>(
  code: ErrorCode,
  message: string,
  details?: D,
  cause?: unknown
): DomainError<D> => ({ type: 'DomainError', code, message, details, cause });

export type ActionOk<T> = { ok: true; data: T };
export type ActionFail<E> = { ok: false; error: DomainError<E> };
export type ActionResult<T, E extends object = object> =
  | ActionOk<T>
  | ActionFail<E>;

export const Ok = <T>(data: T): ActionOk<T> => ({ ok: true, data });
export const Err = <E extends object>(
  error: DomainError<E>
): ActionFail<E> => ({ ok: false, error });

export const isOk = <T, E extends object>(
  r: ActionResult<T, E>
): r is ActionOk<T> => r.ok;
