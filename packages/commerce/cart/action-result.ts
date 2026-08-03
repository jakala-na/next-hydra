import type { Result } from "effect";
import { domainError, Err, Ok } from "../lib/utils/errors";

export const toCurrentCartMutationData = <A, E>(result: Result.Result<A, E>) =>
  result._tag === "Success"
    ? Ok(result.success)
    : Err(domainError<object>("UNKNOWN", "Current Cart mutation failed"));
