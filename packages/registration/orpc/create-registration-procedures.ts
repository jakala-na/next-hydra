import { ORPCError, os, type RouterClient } from "@orpc/server";
import { matchError, Result } from "better-result";
import type { RegistrationApplication } from "../application";
import type {
  RegistrationApprovalProcessError,
  RegistrationConflictError,
  RegistrationErrorDataMap,
  RegistrationNotFoundError,
  RegistrationOperation,
  RegistrationResult,
  RegistrationStoreError,
  RegistrationSubmitFailedError,
  RegistrationUnknownError,
} from "../domain/errors";
import {
  registrationAdminErrorMap,
  registrationDecideErrorMap,
  registrationGetErrorMap,
  registrationListErrorMap,
  registrationSubmitErrorMap,
} from "./error-codes";
import {
  decideRegistrationInputSchema,
  decideRegistrationResultSchema,
  getRegistrationInputSchema,
  listRegistrationsInputSchema,
  listRegistrationsResultSchema,
  registrationDetailSchema,
  registrationInputSchema,
  startRegistrationResultSchema,
} from "./schemas";

export type RegistrationProcedureContext = {
  approvalSecret?: string;
};

type CreateRegistrationProceduresOptions = {
  application: RegistrationApplication;
  authorizeAdmin(context: RegistrationProcedureContext): Promise<void> | void;
};

const publicProcedure = os.$context<RegistrationProcedureContext>();

type RegistrationProcedureDomainError =
  | RegistrationNotFoundError
  | RegistrationConflictError
  | RegistrationSubmitFailedError
  | RegistrationStoreError
  | RegistrationApprovalProcessError
  | RegistrationUnknownError;

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
): never =>
  matchError(error, {
    RegistrationNotFoundError: (registrationError) => {
      throw new ORPCError<
        "REGISTRATION_NOT_FOUND",
        RegistrationErrorDataMap["REGISTRATION_NOT_FOUND"]
      >("REGISTRATION_NOT_FOUND", {
        data: registrationError.registrationId
          ? { registrationId: registrationError.registrationId }
          : {},
        message: registrationError.message,
        status: 404,
        cause: registrationError.cause,
      });
    },
    RegistrationConflictError: (registrationError) => {
      throw new ORPCError<
        "REGISTRATION_CONFLICT",
        RegistrationErrorDataMap["REGISTRATION_CONFLICT"]
      >("REGISTRATION_CONFLICT", {
        data: {
          registrationId: registrationError.registrationId,
          reason: registrationError.reason,
        },
        message: registrationError.message,
        status: 409,
        cause: registrationError.cause,
      });
    },
    RegistrationSubmitFailedError: (registrationError) => {
      throw new ORPCError<
        "SUBMIT_FAILED",
        RegistrationErrorDataMap["SUBMIT_FAILED"]
      >("SUBMIT_FAILED", {
        data: {
          reason: registrationError.reason,
        },
        message: registrationError.message,
        status: 500,
        cause: registrationError.compensationCause
          ? {
              cause: registrationError.cause,
              compensationCause: registrationError.compensationCause,
            }
          : registrationError.cause,
      });
    },
    RegistrationStoreError: (registrationError) => {
      return toUnknownProcedureError(
        operation,
        registrationError.message,
        registrationError.cause
      );
    },
    RegistrationApprovalProcessError: (registrationError) => {
      return toUnknownProcedureError(
        operation,
        registrationError.message,
        registrationError.cause
      );
    },
    RegistrationUnknownError: (registrationError) => {
      throw new ORPCError<"UNKNOWN", RegistrationErrorDataMap["UNKNOWN"]>(
        "UNKNOWN",
        {
          data: { operation: registrationError.operation },
          message: registrationError.message,
          status: 500,
          cause: registrationError.cause,
        }
      );
    },
  });

const unwrapResult = <T>(
  result: RegistrationResult<T>,
  operation: RegistrationOperation
): T =>
  Result.match(result, {
    ok: (value) => value,
    err: (error) => toProcedureError(error, operation),
  });

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
        return unwrapResult(
          await options.application.submitRegistration(input),
          "submit"
        );
      }),
    get: adminProcedure
      .errors(registrationGetErrorMap)
      .input(getRegistrationInputSchema)
      .output(registrationDetailSchema)
      .handler(async ({ input }) => {
        return unwrapResult(
          await options.application.getRegistration(input),
          "get"
        );
      }),
    list: adminProcedure
      .errors(registrationListErrorMap)
      .input(listRegistrationsInputSchema)
      .output(listRegistrationsResultSchema)
      .handler(async ({ input }) => {
        return unwrapResult(
          await options.application.listRegistrations(input),
          "list"
        );
      }),
    decide: adminProcedure
      .errors(registrationDecideErrorMap)
      .input(decideRegistrationInputSchema)
      .output(decideRegistrationResultSchema)
      .handler(async ({ input }) => {
        return unwrapResult(
          await options.application.decideRegistration(input),
          "decide"
        );
      }),
  };
}

export type RegistrationProcedures = ReturnType<
  typeof createRegistrationProcedures
>;
export type RegistrationRemoteClient = RouterClient<RegistrationProcedures>;
