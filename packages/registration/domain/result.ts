export type DomainError<TCode extends string = string, TDetails = unknown> = {
  type: "DomainError";
  code: TCode;
  message: string;
  details?: TDetails;
  cause?: unknown;
};

export const domainError = <TCode extends string, TDetails = unknown>(
  code: TCode,
  message: string,
  details?: TDetails,
  cause?: unknown
): DomainError<TCode, TDetails> => ({
  type: "DomainError",
  code,
  message,
  details,
  cause,
});

export type ActionOk<T> = { ok: true; data: T };
export type ActionFail<TCode extends string = string, TDetails = unknown> = {
  ok: false;
  error: DomainError<TCode, TDetails>;
};
export type ActionResult<T, TCode extends string = string, TDetails = unknown> =
  | ActionOk<T>
  | ActionFail<TCode, TDetails>;

export const Ok = <T>(data: T): ActionOk<T> => ({ ok: true, data });

export const Err = <TCode extends string, TDetails = unknown>(
  error: DomainError<TCode, TDetails>
): ActionFail<TCode, TDetails> => ({ ok: false, error });

export const isOk = <T, TCode extends string, TDetails>(
  result: ActionResult<T, TCode, TDetails>
): result is ActionOk<T> => result.ok;
