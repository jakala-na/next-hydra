import { ORPCError, os, type RouterClient } from "@orpc/server";
import { matchError, Result } from "better-result";
import type { z } from "zod";
import type { RegistrationApplication } from "../application";
import type {
  RegistrationConflictError,
  RegistrationErrorDataMap,
  RegistrationNotFoundError,
  RegistrationResult,
  RegistrationSubmissionIncompleteError,
} from "../domain/errors";
import {
  decideRegistrationInputSchema,
  decideRegistrationResultSchema,
  getRegistrationInputSchema,
  listRegistrationsInputSchema,
  listRegistrationsResultSchema,
  registrationDetailSchema,
  registrationInputSchema,
  startRegistrationResultSchema,
} from "../domain/schemas";
import {
  registrationAdminErrorMap,
  registrationDecideErrorMap,
  registrationGetErrorMap,
  registrationListErrorMap,
  registrationSubmitErrorMap,
} from "./error-codes";

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
  | RegistrationSubmissionIncompleteError;

const toSubmissionIncompleteProcedureError = (
  registrationError: RegistrationSubmissionIncompleteError
): never => {
  throw new ORPCError<
    "REGISTRATION_SUBMISSION_INCOMPLETE",
    RegistrationErrorDataMap["REGISTRATION_SUBMISSION_INCOMPLETE"]
  >("REGISTRATION_SUBMISSION_INCOMPLETE", {
    data: {
      registrationId: registrationError.registrationId,
    },
    message: registrationError.message,
    status: 500,
    cause: registrationError.cause,
  });
};

const toProcedureError = (error: RegistrationProcedureDomainError): never =>
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
    RegistrationSubmissionIncompleteError: toSubmissionIncompleteProcedureError,
  });

const unwrapResult = <T>(result: RegistrationResult<T>): T =>
  Result.match(result, {
    ok: (value) => value,
    err: (error) => toProcedureError(error),
  });

const validateProcedureOutput = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  output: z.output<TSchema>
) => {
  return schema.parse(output);
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
        return validateProcedureOutput(
          startRegistrationResultSchema,
          unwrapResult(await options.application.submitRegistration(input))
        );
      }),
    get: adminProcedure
      .errors(registrationGetErrorMap)
      .input(getRegistrationInputSchema)
      .output(registrationDetailSchema)
      .handler(async ({ input }) => {
        return validateProcedureOutput(
          registrationDetailSchema,
          unwrapResult(await options.application.getRegistration(input))
        );
      }),
    list: adminProcedure
      .errors(registrationListErrorMap)
      .input(listRegistrationsInputSchema)
      .output(listRegistrationsResultSchema)
      .handler(async ({ input }) => {
        return validateProcedureOutput(
          listRegistrationsResultSchema,
          await options.application.listRegistrations(input)
        );
      }),
    decide: adminProcedure
      .errors(registrationDecideErrorMap)
      .input(decideRegistrationInputSchema)
      .output(decideRegistrationResultSchema)
      .handler(async ({ input }) => {
        return validateProcedureOutput(
          decideRegistrationResultSchema,
          unwrapResult(await options.application.decideRegistration(input))
        );
      }),
  };
}

export type RegistrationProcedures = ReturnType<
  typeof createRegistrationProcedures
>;
export type RegistrationRemoteClient = RouterClient<RegistrationProcedures>;
