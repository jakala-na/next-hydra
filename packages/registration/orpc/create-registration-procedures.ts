import { ORPCError, os, type RouterClient } from "@orpc/server";
import type { RegistrationApplication } from "../application";
import {
  RegistrationConflictError,
  RegistrationNotFoundError,
} from "../application";
import type { RegistrationErrorData } from "../contracts/error-codes";
import {
  decideRegistrationInputSchema,
  decideRegistrationResultSchema,
  getRegistrationInputSchema,
  listRegistrationsInputSchema,
  listRegistrationsResultSchema,
  registrationDetailSchema,
  registrationInputSchema,
  startRegistrationResultSchema,
} from "../contracts/schema";

export type RegistrationProcedureContext = {
  approvalSecret?: string;
};

type CreateRegistrationProceduresOptions = {
  application: RegistrationApplication;
  authorizeAdmin(context: RegistrationProcedureContext): Promise<void> | void;
};

const publicProcedure = os.$context<RegistrationProcedureContext>();

const toProcedureError = (error: unknown): never => {
  if (error instanceof RegistrationNotFoundError) {
    throw new ORPCError<"NOT_FOUND", RegistrationErrorData>("NOT_FOUND", {
      message: error.message,
      data: { code: "not_found" },
    });
  }

  if (error instanceof RegistrationConflictError) {
    throw new ORPCError<"CONFLICT", RegistrationErrorData>("CONFLICT", {
      message: error.message,
      data: { code: "conflict" },
    });
  }

  if (error instanceof ORPCError) {
    throw error;
  }

  throw new ORPCError<"INTERNAL_SERVER_ERROR", RegistrationErrorData>(
    "INTERNAL_SERVER_ERROR",
    {
      message: "Registration submit failed",
      data: { code: "submit_failed" },
      cause: error,
    }
  );
};

export function createRegistrationProcedures(
  options: CreateRegistrationProceduresOptions
) {
  const adminProcedure = publicProcedure.use(async ({ context, next }) => {
    await options.authorizeAdmin(context);
    return next();
  });

  return {
    submit: publicProcedure
      .input(registrationInputSchema)
      .output(startRegistrationResultSchema)
      .handler(async ({ input }) => {
        try {
          return await options.application.submitRegistration(input);
        } catch (error) {
          return toProcedureError(error);
        }
      }),
    get: adminProcedure
      .input(getRegistrationInputSchema)
      .output(registrationDetailSchema)
      .handler(async ({ input }) => {
        try {
          return await options.application.getRegistration(input);
        } catch (error) {
          return toProcedureError(error);
        }
      }),
    list: adminProcedure
      .input(listRegistrationsInputSchema)
      .output(listRegistrationsResultSchema)
      .handler(async ({ input }) => {
        try {
          return await options.application.listRegistrations(input);
        } catch (error) {
          return toProcedureError(error);
        }
      }),
    decide: adminProcedure
      .input(decideRegistrationInputSchema)
      .output(decideRegistrationResultSchema)
      .handler(async ({ input }) => {
        try {
          return await options.application.decideRegistration(input);
        } catch (error) {
          return toProcedureError(error);
        }
      }),
  };
}

export type RegistrationProcedures = ReturnType<
  typeof createRegistrationProcedures
>;
export type RegistrationRemoteClient = RouterClient<RegistrationProcedures>;
