import {
  type RegistrationActionResult,
  registrationNotFoundError,
  unknownRegistrationError,
} from "../domain/errors";
import type { RegistrationStorePort } from "../domain/ports";
import { Err, Ok } from "../domain/result";
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
  ): Promise<RegistrationActionResult<RegistrationDetail>> {
    try {
      const record = await options.registrations.getRegistrationRecord(
        input.registrationId
      );

      if (!record) {
        return Err(registrationNotFoundError(input.registrationId));
      }

      return Ok(toRegistrationDetail(record));
    } catch (error) {
      return Err(unknownRegistrationError("get", error));
    }
  };
}
