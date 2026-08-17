"use server";

import {
  ActionMiddleware,
  normalizeActionSchemaIssuePath,
} from "@repo/actions";
import type { ActionSchemaIssuePath } from "@repo/actions";
import { ErrorIssue } from "@repo/errors";
import { getTranslations } from "@repo/i18n";
import { redirect } from "@repo/i18n/navigation";
import {
  RegistrationFormInputSchema,
  RegistrationFormIssuePath,
  RegistrationFormMessageKey,
  RegistrationFormSuccess,
} from "@repo/registration";
import type {
  RegistrationFormInput,
  RegistrationFormResult,
  RegistrationFormTranslator,
  RegistrationFormValues,
} from "@repo/registration";
import { CreateRegistrationRequest } from "@repo/registration/http/registration-api";
import {
  registrationSubmissionOutcomeUnknown,
  RegistrationSubmissionPublicError,
} from "@repo/registration/public-errors";
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
    address: {
      additionalStreetInfo: input.address.additionalStreetInfo,
      city: input.address.city,
      country: input.address.country,
      postalCode: input.address.postalCode,
      region: input.address.region,
      streetName: input.address.streetName,
    },
    companyName: input.companyName,
    companyPhone: input.companyPhone,
    contactFirstName: input.contactFirstName,
    contactLastName: input.contactLastName,
    email: input.email,
    vatId: input.vatId,
  });

const toIssuePath = (path: ActionSchemaIssuePath | undefined) =>
  normalizeActionSchemaIssuePath(RegistrationFormIssuePath, path, "root");

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
    return new ErrorIssue({
      message: issue.message,
      path: path === "root" ? [] : path.split("."),
    });
  });

  return issues.length === 0
    ? [
        new ErrorIssue({
          message: t("errors.invalidSubmission"),
          path: [],
        }),
      ]
    : issues;
};

const submitRegistrationProgram = Effect.fn("RegistrationForm.submit")(
  function* submitRegistration(
    input: RegistrationFormInput,
    locale: WebActionContext["locale"]
  ): Effect.fn.Return<
    RegistrationFormSuccess,
    RegistrationSubmissionPublicError
  > {
    const client = yield* makeRegistrationRestClient();
    const registration = yield* client.registrations
      .create({
        headers: {
          "x-context-locale": locale,
        },
        payload: toRegistrationInput(input),
      })
      .pipe(
        Effect.catchTags({
          HttpClientError: (error) =>
            error.reason._tag === "TransportError"
              ? Effect.fail(registrationSubmissionOutcomeUnknown(locale))
              : Effect.die(error),
          InputInvalid: Effect.die,
          RegistrationHttpResponseError: (error) =>
            Effect.logError(
              "Registration submission response violated its HTTP contract",
              error.cause
            ).pipe(
              Effect.andThen(
                Effect.fail(registrationSubmissionOutcomeUnknown(locale))
              )
            ),
          SchemaError: Effect.die,
          Unexpected: Effect.die,
        }),
        Effect.tapError((error) =>
          error._tag === "RegistrationApiValidationError"
            ? Effect.void
            : Effect.logError("Registration submission request failed", error)
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
  .error(RegistrationSubmissionPublicError)
  // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This is an Effect action input mapper, not Promise control flow.
  .mapInputIssues((error, { t }) => toInputIssues(error, t))
  .handle((decoded, { locale }) =>
    submitRegistrationProgram(decoded, locale).pipe(
      // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This is an Effect combinator, not Promise control flow.
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

export const submitRegistration = async (
  input: RegistrationFormValues
): Promise<RegistrationFormResult> => await submitRegistrationAction(input);
