"use server";

import { NextServer } from "@repo/actions/next-server";
import {
  ApproveRegistrationInputSchema,
  RegistrationDecisionActionError,
  RegistrationDecisionSuccess,
  RejectRegistrationInputSchema,
} from "@repo/registration/components/admin/registration-view-models";
import { Effect } from "effect";

import { AppRuntime } from "./app-runtime";
import {
  RegistrationReviewers,
  registrationReviewersLayer,
} from "./registration-reviewers";
import type {
  RegistrationReviewerDecisionFailure,
  RegistrationReviewerFailure,
} from "./registration-reviewers";
import { SessionActions } from "./session-actions";

const RegistrationReviewerActions = SessionActions.provide(({ session }) =>
  registrationReviewersLayer(session)
);

const publicDecisionError = (
  error: RegistrationReviewerFailure
): RegistrationDecisionActionError => {
  switch (error._tag) {
    case "RegistrationApiNotFound":
      return { _tag: "RegistrationApiNotFound" };
    case "RegistrationAlreadyApproved":
      return { _tag: "RegistrationAlreadyApproved" };
    case "RegistrationAlreadyRejected":
      return { _tag: "RegistrationAlreadyRejected" };
    case "RegistrationApiConflict":
      return { _tag: "RegistrationDecisionConflict" };
    case "RegistrationDecisionAlreadyProcessing":
      return { _tag: "RegistrationDecisionAlreadyProcessing" };
    case "RegistrationApiUnauthorized":
      return { _tag: "RegistrationApiUnauthorized" };
    case "RegistrationApiForbidden":
      return { _tag: "RegistrationApiForbidden" };
    case "RegistrationApiAuthenticationUnavailable":
    case "RegistrationApiBadRequest":
    case "RegistrationApiError":
    case "HttpClientError":
    case "SchemaError":
      return { _tag: "RegistrationDecisionUnavailable" };
    default:
      return error satisfies never;
  }
};

const approveRegistrationProcedure = RegistrationReviewerActions.procedure(
  "AdminRegistration.approve"
)
  .input(ApproveRegistrationInputSchema)
  .output(RegistrationDecisionSuccess)
  .error(RegistrationDecisionActionError)
  .mapError<RegistrationReviewerDecisionFailure>(publicDecisionError)
  .handle((input) =>
    RegistrationReviewers.pipe(
      Effect.flatMap((reviewers) =>
        reviewers.decide({ ...input, decision: "approved" })
      )
    )
  );

const rejectRegistrationProcedure = RegistrationReviewerActions.procedure(
  "AdminRegistration.reject"
)
  .input(RejectRegistrationInputSchema)
  .output(RegistrationDecisionSuccess)
  .error(RegistrationDecisionActionError)
  .mapError<RegistrationReviewerDecisionFailure>(publicDecisionError)
  .handle((input) =>
    RegistrationReviewers.pipe(
      Effect.flatMap((reviewers) =>
        reviewers.decide({ ...input, decision: "rejected" })
      )
    )
  );

const revalidateRegistrationApprovals = async () => {
  await AppRuntime.runPromise(
    NextServer.pipe(
      Effect.flatMap((next) =>
        next.revalidatePath("/admin/registration-approvals")
      )
    )
  );
};

export const approveRegistration = approveRegistrationProcedure.toAction({
  onSuccess: revalidateRegistrationApprovals,
});

export const rejectRegistration = rejectRegistrationProcedure.toAction({
  onSuccess: revalidateRegistrationApprovals,
});
