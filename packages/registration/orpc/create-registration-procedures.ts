import { ORPCError, os, type RouterClient } from "@orpc/server";
import { matchError, Result } from "better-result";
import type { z } from "zod";
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
  RegistrationValidationIssue,
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

const getCauseMetadata = (cause: unknown) =>
  cause instanceof Error
    ? {
        causeName: cause.name,
        causeMessage: cause.message,
      }
    : {};

const logRegistrationError = (
  kind: "internal" | "output_validation" | "submit_failed",
  payload: Record<string, unknown>
) => {
  console.error(`Registration ${kind} error`, payload);
};

const toInternalProcedureError = (
  operation: RegistrationOperation,
  message: string,
  cause: unknown
): never => {
  const data = {
    operation,
    ...getCauseMetadata(cause),
  } satisfies RegistrationErrorDataMap["REGISTRATION_INTERNAL"];

  logRegistrationError("internal", {
    message,
    ...data,
  });

  throw new ORPCError<
    "REGISTRATION_INTERNAL",
    RegistrationErrorDataMap["REGISTRATION_INTERNAL"]
  >("REGISTRATION_INTERNAL", {
    data,
    message,
    status: 500,
    cause,
  });
};

const toOutputValidationProcedureError = (
  operation: RegistrationOperation,
  message: string,
  cause: unknown,
  issues: RegistrationValidationIssue[]
): never => {
  const data = {
    operation,
    issues,
  } satisfies RegistrationErrorDataMap["REGISTRATION_OUTPUT_VALIDATION_FAILED"];

  logRegistrationError("output_validation", {
    operation,
    message,
    issues,
    ...getCauseMetadata(cause),
  });

  throw new ORPCError<
    "REGISTRATION_OUTPUT_VALIDATION_FAILED",
    RegistrationErrorDataMap["REGISTRATION_OUTPUT_VALIDATION_FAILED"]
  >("REGISTRATION_OUTPUT_VALIDATION_FAILED", {
    data,
    message,
    status: 500,
    cause,
  });
};

const toSubmitFailedProcedureError = (
  registrationError: RegistrationSubmitFailedError
): never => {
  logRegistrationError("submit_failed", {
    reason: registrationError.reason,
    cause: getCauseMetadata(registrationError.cause),
    compensationCause: registrationError.compensationCause
      ? getCauseMetadata(registrationError.compensationCause)
      : undefined,
  });

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
    RegistrationSubmitFailedError: toSubmitFailedProcedureError,
    RegistrationStoreError: (registrationError) => {
      return toInternalProcedureError(
        operation,
        registrationError.message,
        registrationError.cause
      );
    },
    RegistrationApprovalProcessError: (registrationError) => {
      return toInternalProcedureError(
        operation,
        registrationError.message,
        registrationError.cause
      );
    },
    RegistrationUnknownError: (registrationError) => {
      return toInternalProcedureError(
        registrationError.operation,
        registrationError.message,
        registrationError.cause
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

const validateProcedureOutput = <TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  output: z.output<TSchema>,
  operation: RegistrationOperation
) => {
  const result = schema.safeParse(output);

  if (!result.success) {
    return toOutputValidationProcedureError(
      operation,
      `Registration ${operation} output validation failed`,
      result.error,
      result.error.issues.map((issue) => ({
        path: issue.path,
        message: issue.message,
        code: issue.code,
      }))
    );
  }

  return result.data;
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
          unwrapResult(
            await options.application.submitRegistration(input),
            "submit"
          ),
          "submit"
        );
      }),
    get: adminProcedure
      .errors(registrationGetErrorMap)
      .input(getRegistrationInputSchema)
      .output(registrationDetailSchema)
      .handler(async ({ input }) => {
        return validateProcedureOutput(
          registrationDetailSchema,
          unwrapResult(await options.application.getRegistration(input), "get"),
          "get"
        );
      }),
    list: adminProcedure
      .errors(registrationListErrorMap)
      .input(listRegistrationsInputSchema)
      .output(listRegistrationsResultSchema)
      .handler(async ({ input }) => {
        return validateProcedureOutput(
          listRegistrationsResultSchema,
          unwrapResult(
            await options.application.listRegistrations(input),
            "list"
          ),
          "list"
        );
      }),
    decide: adminProcedure
      .errors(registrationDecideErrorMap)
      .input(decideRegistrationInputSchema)
      .output(decideRegistrationResultSchema)
      .handler(async ({ input }) => {
        return validateProcedureOutput(
          decideRegistrationResultSchema,
          unwrapResult(
            await options.application.decideRegistration(input),
            "decide"
          ),
          "decide"
        );
      }),
  };
}

export type RegistrationProcedures = ReturnType<
  typeof createRegistrationProcedures
>;
export type RegistrationRemoteClient = RouterClient<RegistrationProcedures>;
