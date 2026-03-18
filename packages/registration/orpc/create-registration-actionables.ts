import { ORPCError, os } from "@orpc/server";
import {
  type RegistrationErrorCode,
  type RegistrationErrorDataMap,
  registrationSubmitErrorMap,
} from "../contracts/error-codes";
import {
  registrationInputSchema,
  startRegistrationResultSchema,
} from "../contracts/schema";
import type { RegistrationRemoteClient } from "./types";

type RegistrationSubmitExecutor = Pick<RegistrationRemoteClient, "submit">;

const toActionableError = (error: unknown): never => {
  if (error instanceof ORPCError) {
    throw error;
  }

  throw new ORPCError<"UNKNOWN", RegistrationErrorDataMap["UNKNOWN"]>(
    "UNKNOWN",
    {
      data: { operation: "submit" },
      message: "Registration submit bridge failed",
      status: 500,
      cause: error,
    }
  );
};

export function createRegistrationActionables(
  executor: RegistrationSubmitExecutor
) {
  return {
    submit: os
      .input(registrationInputSchema)
      .errors(registrationSubmitErrorMap)
      .output(startRegistrationResultSchema)
      .handler(async ({ input }) => {
        try {
          return await executor.submit(input);
        } catch (error) {
          return toActionableError(
            error as ORPCError<
              RegistrationErrorCode,
              RegistrationErrorDataMap[keyof RegistrationErrorDataMap]
            >
          );
        }
      })
      .actionable(),
  };
}

export type RegistrationActionables = ReturnType<
  typeof createRegistrationActionables
>;
export type RegistrationSubmitActionable = RegistrationActionables["submit"];
