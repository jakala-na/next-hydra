import { safe } from "@orpc/client";
import { os } from "@orpc/server";
import {
  registrationInputSchema,
  startRegistrationResultSchema,
} from "../domain/schemas";
import type { RegistrationRemoteClient } from "./create-registration-procedures";
import { registrationSubmitErrorMap } from "./error-codes";

type RegistrationSubmitExecutor = Pick<RegistrationRemoteClient, "submit">;
type CreateRegistrationActionablesOptions = {
  executor: RegistrationSubmitExecutor;
  rpcUrl?: string;
};

export function createRegistrationActionables(
  options: CreateRegistrationActionablesOptions
) {
  return {
    submit: os
      .input(registrationInputSchema)
      .errors(registrationSubmitErrorMap)
      .output(startRegistrationResultSchema)
      .handler(async ({ input }) => {
        const [error, data] = await safe(options.executor.submit(input));

        if (!error) {
          return data;
        }

        throw error;
      })
      .actionable(),
  };
}

export type RegistrationActionables = ReturnType<
  typeof createRegistrationActionables
>;
export type RegistrationSubmitActionable = RegistrationActionables["submit"];
