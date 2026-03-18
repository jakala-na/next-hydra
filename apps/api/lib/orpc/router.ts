import { ORPCError } from "@orpc/server";
import type { UnauthorizedRegistrationErrorData } from "@repo/registration/contracts/error-codes";
import { createRegistrationProcedures } from "@repo/registration/orpc/create-registration-procedures";
import type { RegistrationProcedureContext } from "@repo/registration/orpc/types";
import { env } from "../../env";
import { registrationApplication } from "../registration-application";

const authorizeAdmin = (context: RegistrationProcedureContext) => {
  if (context.approvalSecret !== env.REGISTRATION_APPROVAL_SECRET) {
    throw new ORPCError<"UNAUTHORIZED", UnauthorizedRegistrationErrorData>(
      "UNAUTHORIZED",
      {
        data: { reason: "invalid_approval_secret" },
      }
    );
  }
};

export const router = {
  registration: createRegistrationProcedures({
    application: registrationApplication,
    authorizeAdmin,
  }),
};
