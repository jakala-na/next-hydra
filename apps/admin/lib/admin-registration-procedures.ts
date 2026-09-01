import type { ActionClient } from "@repo/actions";
import {
  ApproveRegistrationInputSchema,
  RegistrationDecisionActionError,
  RegistrationDecisionSuccess,
  RejectRegistrationInputSchema,
} from "@repo/registration/components/admin/registration-view-models";
import { Effect } from "effect";

import { RegistrationReviewers } from "./registration-reviewers-api";
import type { AdminSessionActionContext } from "./session-actions";

export const makeAdminRegistrationProcedures = <
  RuntimeServices,
  Context extends AdminSessionActionContext,
>(
  actions: ActionClient<
    RegistrationReviewers,
    never,
    RuntimeServices,
    Context,
    "Provided"
  >
) => ({
  approveRegistrationProcedure: actions
    .procedure("AdminRegistration.approve")
    .input(ApproveRegistrationInputSchema)
    .output(RegistrationDecisionSuccess)
    .error(RegistrationDecisionActionError)
    .handle((input) =>
      RegistrationReviewers.pipe(
        Effect.flatMap((reviewers) =>
          reviewers.decide({ ...input, decision: "approved" })
        )
      )
    ),
  rejectRegistrationProcedure: actions
    .procedure("AdminRegistration.reject")
    .input(RejectRegistrationInputSchema)
    .output(RegistrationDecisionSuccess)
    .error(RegistrationDecisionActionError)
    .handle((input) =>
      RegistrationReviewers.pipe(
        Effect.flatMap((reviewers) =>
          reviewers.decide({ ...input, decision: "rejected" })
        )
      )
    ),
});
