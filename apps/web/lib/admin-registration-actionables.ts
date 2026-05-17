"use server";

import { safe } from "@orpc/client";
import { ORPCError, os } from "@orpc/server";
import {
  decideRegistrationInputSchema,
  decideRegistrationResultSchema,
} from "@repo/registration/domain/schemas";
import { registrationDecideErrorMap } from "@repo/registration/orpc/error-codes";
import { getAdminActor } from "@/lib/admin-auth";
import { adminRegistrationClient } from "@/lib/orpc/admin-registration-client";

export const decideRegistration = os
  .input(
    decideRegistrationInputSchema.omit({ actorEmail: true, actorName: true })
  )
  .errors(registrationDecideErrorMap)
  .output(decideRegistrationResultSchema)
  .handler(async ({ input }) => {
    const actor = await getAdminActor();
    const [error, data] = await safe(
      adminRegistrationClient.decide({
        ...input,
        ...actor,
      })
    );

    if (!error) {
      return data;
    }

    if (
      error instanceof ORPCError &&
      (error.code === "UNAUTHORIZED" ||
        error.code === "REGISTRATION_NOT_FOUND" ||
        error.code === "REGISTRATION_CONFLICT")
    ) {
      throw error;
    }

    throw error;
  })
  .actionable();
