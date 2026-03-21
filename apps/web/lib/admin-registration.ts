import "server-only";

import type {
  GetRegistrationInput,
  ListRegistrationsInput,
} from "@repo/registration/domain/types";
import { adminRegistrationClient } from "@/lib/orpc/admin-registration-client";

export async function listAdminRegistrations(input: ListRegistrationsInput) {
  return await adminRegistrationClient.list(input);
}

export async function getAdminRegistration(input: GetRegistrationInput) {
  return await adminRegistrationClient.get(input);
}
