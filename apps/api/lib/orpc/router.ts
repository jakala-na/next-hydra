import { ORPCError } from "@orpc/server";
import type { RegistrationErrorData } from "@repo/registration/contracts/error-codes";
import { createRegistrationProcedures } from "@repo/registration/orpc/create-registration-procedures";
import type { RegistrationProcedureContext } from "@repo/registration/orpc/types";
import { env } from "../../env";
import { registrationApplication } from "../registration-application";

const authorizeAdmin = (context: RegistrationProcedureContext) => {
  if (context.approvalSecret !== env.REGISTRATION_APPROVAL_SECRET) {
    throw new ORPCError<"UNAUTHORIZED", RegistrationErrorData>("UNAUTHORIZED", {
      data: { code: "unauthorized" },
    });
  }
};

export const router = {
  registration: createRegistrationProcedures({
    application: registrationApplication,
    authorizeAdmin,
  }),
};
