import { domainError, Err, Ok } from "@repo/commerce/lib/utils/errors";
import type { Result } from "effect";

export const toCurrentCartMutationData = <A, E>(result: Result.Result<A, E>) =>
  result._tag === "Success"
    ? Ok(result.success)
    : Err(domainError<object>("UNKNOWN", "Current Cart mutation failed"));
