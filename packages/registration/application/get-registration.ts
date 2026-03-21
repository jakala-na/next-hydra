import { Result } from "better-result";
import {
  RegistrationNotFoundError,
  type RegistrationResult,
  RegistrationStoreError,
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
  ): Promise<RegistrationResult<RegistrationDetail>> {
    const recordResult = await Result.tryPromise({
      try: () =>
        options.registrations.getRegistrationRecord(input.registrationId),
      catch: (cause) =>
        new RegistrationStoreError({
          operation: "get_registration_record",
          cause,
        }),
    });

    if (recordResult.isErr()) {
      return recordResult;
    }

    if (!recordResult.value) {
      return Result.err(
        new RegistrationNotFoundError({ registrationId: input.registrationId })
      );
    }

    return Result.ok(toRegistrationDetail(recordResult.value));
  };
}
