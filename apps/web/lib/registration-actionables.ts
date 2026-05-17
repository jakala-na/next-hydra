"use server";

import { createRegistrationActionables } from "@repo/registration/orpc/create-registration-actionables";
import {
  registrationClient,
  registrationRpcUrl,
} from "./orpc/registration-client";

const registrationActionables = createRegistrationActionables({
  executor: registrationClient,
  rpcUrl: registrationRpcUrl,
});

export const submitRegistration = registrationActionables.submit;
