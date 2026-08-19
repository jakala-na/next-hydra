"use server";

import { ActionMiddleware } from "@repo/actions";
import { getTranslations } from "@repo/i18n";
import { redirect } from "@repo/i18n/navigation";
import type {
  RegistrationFormResult,
  RegistrationFormTranslator,
  RegistrationFormValues,
} from "@repo/registration";
import {
  RegistrationFormInputSchema,
  RegistrationFormSuccess,
} from "@repo/registration";
import { RegistrationSubmissionPublicError } from "@repo/registration/public-errors";
import { Effect } from "effect";

import { Actions } from "./actions";
import type { WebActionContext } from "./actions";
import type { RegistrationActionContext } from "./registration-procedures";
import {
  submitRegistrationProgram,
  toRegistrationInputIssues,
} from "./registration-procedures";
import { registrationClientLayer } from "./registration-rest-client";

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
const RegistrationActions = Actions.use(registrationTranslations).provide(
  (_context: RegistrationActionContext) => registrationClientLayer()
);

const submitRegistrationProcedure = RegistrationActions.procedure(
  "RegistrationForm.submit"
)
  .input(RegistrationFormInputSchema)
  .output(RegistrationFormSuccess)
  .error(RegistrationSubmissionPublicError)
  // oxlint-disable-next-line promise/prefer-await-to-callbacks -- This is an Effect action input mapper, not Promise control flow.
  .mapInputIssues((error, { t }) => toRegistrationInputIssues(error, t))
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
