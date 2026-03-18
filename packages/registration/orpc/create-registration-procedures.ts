import { ORPCError, os, type RouterClient } from "@orpc/server";
import type { RegistrationApplication } from "../application";
import {
  type RegistrationOperation,
  type RegistrationErrorDataMap,
  registrationAdminErrorMap,
  registrationDecideErrorMap,
  registrationGetErrorMap,
  registrationListErrorMap,
  registrationSubmitErrorMap,
  type UnauthorizedRegistrationErrorData,
} from "../contracts/error-codes";
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
import { type DomainError, isOk } from "../lib/result";

export type RegistrationProcedureContext = {
  approvalSecret?: string;
};

type CreateRegistrationProceduresOptions = {
  application: RegistrationApplication;
  authorizeAdmin(context: RegistrationProcedureContext): Promise<void> | void;
};

const publicProcedure = os.$context<RegistrationProcedureContext>();

type RegistrationProcedureDomainError =
  | DomainError<"UNAUTHORIZED", RegistrationErrorDataMap["UNAUTHORIZED"]>
  | DomainError<
      "REGISTRATION_NOT_FOUND",
      RegistrationErrorDataMap["REGISTRATION_NOT_FOUND"]
    >
  | DomainError<
      "REGISTRATION_CONFLICT",
      RegistrationErrorDataMap["REGISTRATION_CONFLICT"]
    >
  | DomainError<"SUBMIT_FAILED", RegistrationErrorDataMap["SUBMIT_FAILED"]>
  | DomainError<"UNKNOWN", RegistrationErrorDataMap["UNKNOWN"]>;

const toUnknownProcedureError = (
  operation: RegistrationOperation,
  message: string,
  cause: unknown
): never => {
  throw new ORPCError<"UNKNOWN", RegistrationErrorDataMap["UNKNOWN"]>(
    "UNKNOWN",
    {
      data: { operation },
      message,
      status: 500,
      cause,
    }
  );
};

const toProcedureError = (
  error: RegistrationProcedureDomainError,
  operation: RegistrationOperation
): never => {
  switch (error.code) {
    case "UNAUTHORIZED":
      throw new ORPCError<
        "UNAUTHORIZED",
        RegistrationErrorDataMap["UNAUTHORIZED"]
      >("UNAUTHORIZED", {
        data: (error.details ?? {
          reason: "invalid_approval_secret",
        }) satisfies UnauthorizedRegistrationErrorData,
        message: error.message,
        status: 401,
        cause: error.cause,
      });
    case "REGISTRATION_NOT_FOUND":
      throw new ORPCError<
        "REGISTRATION_NOT_FOUND",
        RegistrationErrorDataMap["REGISTRATION_NOT_FOUND"]
      >("REGISTRATION_NOT_FOUND", {
        data: error.details ?? {},
        message: error.message,
        status: 404,
        cause: error.cause,
      });
    case "REGISTRATION_CONFLICT":
      if (!error.details) {
        return toUnknownProcedureError(
          operation,
          "Registration conflict details were missing",
          error.cause ?? error
        );
      }

      throw new ORPCError<
        "REGISTRATION_CONFLICT",
        RegistrationErrorDataMap["REGISTRATION_CONFLICT"]
      >("REGISTRATION_CONFLICT", {
        data: error.details,
        message: error.message,
        status: 409,
        cause: error.cause,
      });
    case "SUBMIT_FAILED":
      if (!error.details) {
        return toUnknownProcedureError(
          operation,
          "Registration submit failure details were missing",
          error.cause ?? error
        );
      }

      throw new ORPCError<
        "SUBMIT_FAILED",
        RegistrationErrorDataMap["SUBMIT_FAILED"]
      >("SUBMIT_FAILED", {
        data: error.details,
        message: error.message,
        status: 500,
        cause: error.cause,
      });
    default:
      throw new ORPCError<"UNKNOWN", RegistrationErrorDataMap["UNKNOWN"]>(
        "UNKNOWN",
        {
          data: error.details ?? { operation },
          message: error.message,
          status: 500,
          cause: error.cause,
        }
      );
  }
};

export function createRegistrationProcedures(
  options: CreateRegistrationProceduresOptions
) {
  const adminProcedure = publicProcedure
    .errors(registrationAdminErrorMap)
    .use(async ({ context, next }) => {
      await options.authorizeAdmin(context);
      return next();
    });

  return {
    submit: publicProcedure
      .errors(registrationSubmitErrorMap)
      .input(registrationInputSchema)
      .output(startRegistrationResultSchema)
      .handler(async ({ input }) => {
        const result = await options.application.submitRegistration(input);

        if (isOk(result)) {
          return result.data;
        }

        return toProcedureError(result.error as RegistrationProcedureDomainError, "submit");
      }),
    get: adminProcedure
      .errors(registrationGetErrorMap)
      .input(getRegistrationInputSchema)
      .output(registrationDetailSchema)
      .handler(async ({ input }) => {
        const result = await options.application.getRegistration(input);

        if (isOk(result)) {
          return result.data;
        }

        return toProcedureError(result.error as RegistrationProcedureDomainError, "get");
      }),
    list: adminProcedure
      .errors(registrationListErrorMap)
      .input(listRegistrationsInputSchema)
      .output(listRegistrationsResultSchema)
      .handler(async ({ input }) => {
        const result = await options.application.listRegistrations(input);

        if (isOk(result)) {
          return result.data;
        }

        return toProcedureError(result.error as RegistrationProcedureDomainError, "list");
      }),
    decide: adminProcedure
      .errors(registrationDecideErrorMap)
      .input(decideRegistrationInputSchema)
      .output(decideRegistrationResultSchema)
      .handler(async ({ input }) => {
        const result = await options.application.decideRegistration(input);

        if (isOk(result)) {
          return result.data;
        }

        return toProcedureError(result.error as RegistrationProcedureDomainError, "decide");
      }),
  };
}

export type RegistrationProcedures = ReturnType<
  typeof createRegistrationProcedures
>;
export type RegistrationRemoteClient = RouterClient<RegistrationProcedures>;
