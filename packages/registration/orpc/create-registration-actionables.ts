import { ORPCError, os } from "@orpc/server";
import type { RegistrationRemoteClient } from "./create-registration-procedures";
import {
  type RegistrationErrorCode,
  type RegistrationErrorDataMap,
  registrationSubmitErrorMap,
} from "./error-codes";
import {
  registrationInputSchema,
  startRegistrationResultSchema,
} from "./schemas";

type RegistrationSubmitExecutor = Pick<RegistrationRemoteClient, "submit">;

const getCauseMetadata = (cause: unknown) =>
  cause instanceof Error
    ? {
        causeName: cause.name,
        causeMessage: cause.message,
      }
    : {};

const toActionableError = (error: unknown): never => {
  if (error instanceof ORPCError) {
    throw error;
  }

  throw new ORPCError("REGISTRATION_INTERNAL", {
    data: { operation: "submit", ...getCauseMetadata(error) },
    message: "Registration submit bridge failed",
    status: 500,
    cause: error,
  });
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
