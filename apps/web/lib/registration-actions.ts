"use server";

import {
  ActionInputIssue,
  type ActionSchemaIssuePath,
  ActionMiddleware,
  normalizeActionSchemaIssuePath,
} from "@repo/actions";
import { getTranslations } from "@repo/i18n";
import { redirect } from "@repo/i18n/navigation";
import {
  RegistrationFormFailure,
  RegistrationFormInputSchema,
  RegistrationFormIssue,
  RegistrationFormIssuePath,
  RegistrationFormMessageKey,
  RegistrationFormSuccess,
  RegistrationIntakeValidationError,
} from "@repo/registration";
import type {
  RegistrationFormInput,
  RegistrationFormResult,
  RegistrationFormTranslator,
  RegistrationFormValues,
  RegistrationSubmissionUnavailable,
} from "@repo/registration";
import { CreateRegistrationRequest } from "@repo/registration/http/registration-api";
import type { RegistrationApiValidationError } from "@repo/registration/http/registration-api";
import { Effect, Schema, SchemaIssue } from "effect";

import { Actions } from "./actions";
import type { WebActionContext } from "./actions";
import { makeRegistrationRestClient } from "./registration-rest-client";

const AWAITING_APPROVAL_HREF = "/register/awaiting-approval";

const registrationTranslations = ActionMiddleware.context<
  WebActionContext,
  { readonly t: RegistrationFormTranslator }
>(({ locale }) =>
  Effect.promise(async () => {
    const translate = await getTranslations({
      locale,
      namespace: "web.registration.form",
    });

    return {
      t: (key) => translate(key),
    };
  })
);

// oxlint-disable-next-line react-hooks/rules-of-hooks -- ActionClient.use composes action middleware; it is not a React Hook.
const RegistrationActions = Actions.use(registrationTranslations);

const toRegistrationInput = (
  input: RegistrationFormInput
): CreateRegistrationRequest =>
  new CreateRegistrationRequest({
    companyName: input.companyName,
    companyPhone: input.companyPhone,
    vatId: input.vatId,
    contactFirstName: input.contactFirstName,
    contactLastName: input.contactLastName,
    email: input.email,
    address: {
      streetName: input.address.streetName,
      additionalStreetInfo: input.address.additionalStreetInfo,
      postalCode: input.address.postalCode,
      city: input.address.city,
      region: input.address.region,
      country: input.address.country,
    },
  });

const toRegistrationValidationFailure = (
  error: RegistrationApiValidationError
): RegistrationIntakeValidationError =>
  new RegistrationIntakeValidationError({
    message: error.message,
    reasons: error.reasons,
  });

type RegistrationSubmissionFailure =
  | RegistrationIntakeValidationError
  | RegistrationSubmissionUnavailable;

const toIssuePath = (path: ActionSchemaIssuePath | undefined) =>
  normalizeActionSchemaIssuePath(RegistrationFormIssuePath, path, "root");

const makeRootIssue = (message: string) =>
  new RegistrationFormIssue({ path: "root", message });

const toInputIssues = (
  error: Schema.SchemaError,
  t: RegistrationFormTranslator
) => {
  const translatedSchemaMessage = (message: string | undefined) =>
    message !== undefined && Schema.is(RegistrationFormMessageKey)(message)
      ? t(message)
      : t("errors.invalidSubmission");
  const formatted = SchemaIssue.makeFormatterStandardSchemaV1({
    checkHook: (issue) =>
      issue.issue._tag === "Pointer" || issue.issue._tag === "Composite"
        ? undefined
        : translatedSchemaMessage(SchemaIssue.defaultCheckHook(issue)),
    leafHook: (issue) => {
      const message =
        issue._tag === "InvalidValue" ? issue.annotations?.message : undefined;

      return translatedSchemaMessage(
        typeof message === "string" ? message : undefined
      );
    },
  })(error.issue);

  const issues = formatted.issues.map((issue) => {
    const path = toIssuePath(issue.path);
    return new ActionInputIssue({
      path: path === "root" ? [] : path.split("."),
      message: issue.message,
    });
  });

  return issues.length === 0
    ? [
        new ActionInputIssue({
          path: [],
          message: t("errors.invalidSubmission"),
        }),
      ]
    : issues;
};

const toSubmissionFailure = (
  error: RegistrationSubmissionFailure,
  t: RegistrationFormTranslator
): RegistrationFormFailure => {
  switch (error._tag) {
    case "RegistrationIntakeValidationError": {
      const toReasonIssue = (
        reason: (typeof error.reasons)[number]
      ): RegistrationFormIssue => {
        switch (reason._tag) {
          case "DuplicateRegistrationEmail":
            return new RegistrationFormIssue({
              path: reason.path,
              message: t("validation.duplicateEmail"),
            });
          case "InvalidRegistrationVatId":
            return new RegistrationFormIssue({
              path: reason.path,
              message: t("validation.invalidVatId"),
            });
          case "UnsupportedRegistrationCountry":
            return makeRootIssue(t("errors.unsupportedRegistrationCountry"));
          default:
            return reason satisfies never;
        }
      };
      const [firstReason, ...remainingReasons] = error.reasons;

      return {
        error,
        issues: [
          toReasonIssue(firstReason),
          ...remainingReasons.map(toReasonIssue),
        ],
      } satisfies RegistrationFormFailure;
    }
    case "RegistrationSubmissionUnavailable":
      return {
        error,
        issues: [makeRootIssue(t("errors.submitFailed"))],
      } satisfies RegistrationFormFailure;
    default:
      return error satisfies never;
  }
};

const submitRegistrationProgram = Effect.fn("RegistrationForm.submit")(
  function* (
    input: RegistrationFormInput,
    locale: WebActionContext["locale"]
  ): Effect.fn.Return<RegistrationFormSuccess, RegistrationSubmissionFailure> {
    const client = yield* makeRegistrationRestClient();
    const registration = yield* client.registrations
      .create({
        headers: {
          "x-context-locale": locale,
        },
        payload: toRegistrationInput(input),
      })
      .pipe(
        Effect.tapError((error) =>
          error._tag === "RegistrationApiValidationError"
            ? Effect.void
            : Effect.logError("Registration submission request failed", error)
        ),
        Effect.mapError(
          (error): RegistrationSubmissionFailure =>
            error._tag === "RegistrationApiValidationError"
              ? toRegistrationValidationFailure(error)
              : { _tag: "RegistrationSubmissionUnavailable" }
        )
      );

    return {
      registrationId: registration.registrationId,
    };
  }
);

const submitRegistrationProcedure = RegistrationActions.procedure(
  "RegistrationForm.submit"
)
  .input(RegistrationFormInputSchema)
  .output(RegistrationFormSuccess)
  .error(RegistrationFormFailure)
  .mapInputIssues((error, { t }) => toInputIssues(error, t))
  .mapError((error: RegistrationSubmissionFailure, { t }) =>
    toSubmissionFailure(error, t)
  )
  .handle((decoded, { locale }) =>
    submitRegistrationProgram(decoded, locale).pipe(
      Effect.tapDefect((defect) =>
        Effect.logError("Registration submission defect", defect).pipe(
          Effect.withLogSpan("registration.form.submit.failure")
        )
      ),
      Effect.annotateSpans({
        "registration.operation": "form.submit",
      }),
      Effect.annotateLogs({
        operation: "registration.form.submit",
        service: "web",
      })
    )
  );

const submitRegistrationAction = submitRegistrationProcedure.toAction({
  onSuccess: (_registration, { locale }) =>
    redirect({ href: AWAITING_APPROVAL_HREF, locale }),
});

export async function submitRegistration(
  input: RegistrationFormValues
): Promise<RegistrationFormResult> {
  return await submitRegistrationAction(input);
}
