import { Result } from "better-result";
import {
  RegistrationNotFoundError,
  type RegistrationResult,
} from "../domain/errors";
import type { RegistrationStorePort } from "../domain/ports";
import {
  type GetRegistrationInput,
  type RegistrationDetail,
  toRegistrationDetail,
} from "../domain/types";

type CreateGetRegistrationOptions = {
  registrations: RegistrationStorePort;
};

export function createGetRegistration(options: CreateGetRegistrationOptions) {
  return async function getRegistration(
    input: GetRegistrationInput
  ): Promise<
    RegistrationResult<RegistrationDetail, RegistrationNotFoundError>
  > {
    const recordResult = await options.registrations.getRegistrationRecord(
      input.registrationId
    );

    if (recordResult.isErr()) {
      if (recordResult.error instanceof RegistrationNotFoundError) {
        return Result.err(recordResult.error);
      }

      throw recordResult.error;
    }

    return Result.ok(toRegistrationDetail(recordResult.value));
  };
}
