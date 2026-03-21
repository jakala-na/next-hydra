"use server";

import { ORPCError, os } from "@orpc/server";
import type {
  RegistrationErrorCode,
  RegistrationErrorDataMap,
} from "@repo/registration/orpc/error-codes";
import { registrationDecideErrorMap } from "@repo/registration/orpc/error-codes";
import {
  decideRegistrationInputSchema,
  decideRegistrationResultSchema,
} from "@repo/registration/orpc/schemas";
import { getAdminActor } from "@/lib/admin-auth";
import { adminRegistrationClient } from "@/lib/orpc/admin-registration-client";

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
    data: { operation: "decide", ...getCauseMetadata(error) },
    message: "Registration decision bridge failed",
    status: 500,
    cause: error,
  });
};

export const decideRegistration = os
  .input(
    decideRegistrationInputSchema.omit({ actorEmail: true, actorName: true })
  )
  .errors(registrationDecideErrorMap)
  .output(decideRegistrationResultSchema)
  .handler(async ({ input }) => {
    const actor = await getAdminActor();

    try {
      return await adminRegistrationClient.decide({
        ...input,
        ...actor,
      });
    } catch (error) {
      return toActionableError(
        error as ORPCError<
          RegistrationErrorCode,
          RegistrationErrorDataMap[keyof RegistrationErrorDataMap]
        >
      );
    }
  })
  .actionable();
