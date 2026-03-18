"use server";

import { createRegistrationActionables } from "@repo/registration/orpc/create-registration-actionables";
import { registrationClient } from "./orpc/registration-client";

const registrationActionables = createRegistrationActionables(registrationClient);

export const submitRegistration = registrationActionables.submit;
