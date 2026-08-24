"use server";

import { NextServer } from "@repo/actions/next-server";
import { Effect } from "effect";

// oxlint-disable-next-line anti-slop-effect/no-service-constructor-imports -- This procedure factory is shared with tests; it does not construct an Effect service.
import { makeAdminRegistrationProcedures } from "./admin-registration-procedures";
import { AppRuntime } from "./app-runtime";
import { registrationReviewersLayer } from "./registration-reviewers";
import { SessionActions } from "./session-actions";

const RegistrationReviewerActions = SessionActions.provide(({ session }) =>
  registrationReviewersLayer(session)
);

const { approveRegistrationProcedure, rejectRegistrationProcedure } =
  makeAdminRegistrationProcedures(RegistrationReviewerActions);

const revalidateRegistrationApprovals = async () => {
  await AppRuntime.runPromise(
    NextServer.pipe(
      Effect.flatMap((next) => next.revalidatePath("/registration-approvals"))
    )
  );
};

export const approveRegistration = approveRegistrationProcedure.toAction({
  onSuccess: revalidateRegistrationApprovals,
});

export const rejectRegistration = rejectRegistrationProcedure.toAction({
  onSuccess: revalidateRegistrationApprovals,
});
