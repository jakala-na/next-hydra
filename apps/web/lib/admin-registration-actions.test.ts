import { ActionClient, ActionMiddleware } from "@repo/actions";
import type { EmptyActionContext } from "@repo/actions";
import { NextServer } from "@repo/actions/next-server";
import type { Locale } from "@repo/i18n/types";
import { RegistrationId } from "@repo/registration";
import {
  RegistrationDecisionOutcomeUnknownFailure,
  RegistrationApiErrorFailure,
  PublicRegistrationConcurrentModificationFailure,
  PublicRegistrationNotFoundFailure,
} from "@repo/registration/public-errors";
import { Effect, Layer, ManagedRuntime, Redacted } from "effect";
import { describe, expect, it } from "vitest";

import { makeAdminRegistrationProcedures } from "./admin-registration-procedures";
import type { CurrentAuthSnapshot } from "./current-auth-api";
import { CurrentAuth } from "./current-auth-api";
import type { NextCookieStore } from "./next-request-api";
import { NextRequestApi } from "./next-request-api";
import type { DecideRegistration } from "./registration-reviewers-api";
import { registrationReviewersLayerFrom } from "./registration-reviewers-api";
import type { WebSessionActionContext } from "./session-actions";

const makeHarness = (options: {
  readonly decide: DecideRegistration;
  readonly session?: CurrentAuthSnapshot;
}) => {
  const revalidated: string[] = [];
  const session: CurrentAuthSnapshot = options.session ?? {
    accessToken: Redacted.make("access-token"),
    permissions: ["registration.decide"],
    userId: "user-1",
  };

  const runtime = ManagedRuntime.make(
    Layer.mergeAll(
      Layer.succeed(CurrentAuth, {
        snapshot: Effect.succeed(session),
      }),
      Layer.succeed(NextRequestApi, {
        connect: () => Effect.void,
        getCookies: () =>
          Effect.succeed({
            delete: () => {
              /* unused */
            },
            get: (): { readonly value: string } | undefined => undefined,
            set: () => {
              /* unused */
            },
          } satisfies NextCookieStore),
        getLocale: () => Effect.succeed("en-US"),
      }),
      Layer.succeed(NextServer, {
        refresh: () => Effect.void,
        revalidatePath: (path) => Effect.sync(() => revalidated.push(path)),
      })
    )
  );

  const TestActions = ActionClient.make(runtime)
    .use(
      ActionMiddleware.context<EmptyActionContext, { readonly locale: Locale }>(
        () => Effect.succeed({ locale: "en-US" })
      )
    )
    .use(
      ActionMiddleware.context<
        { readonly locale: Locale },
        Pick<WebSessionActionContext, "session">,
        CurrentAuth
      >(() =>
        CurrentAuth.pipe(
          Effect.flatMap((currentAuth) => currentAuth.snapshot),
          Effect.map((currentSession) => ({ session: currentSession }))
        )
      )
    )
    .provide(({ session: currentSession }) =>
      registrationReviewersLayerFrom(currentSession, options.decide)
    );

  const { approveRegistrationProcedure, rejectRegistrationProcedure } =
    makeAdminRegistrationProcedures(TestActions);

  const revalidate = async () => {
    await runtime.runPromise(
      NextServer.pipe(
        Effect.flatMap((next) =>
          next.revalidatePath("/admin/registration-approvals")
        )
      )
    );
  };

  return {
    approveRegistration: approveRegistrationProcedure.toAction({
      onSuccess: revalidate,
    }),
    rejectRegistration: rejectRegistrationProcedure.toAction({
      onSuccess: revalidate,
    }),
    revalidated,
  };
};

describe("admin registration actions", () => {
  it("provides authenticated access, encodes success, and revalidates", async () => {
    const calls: {
      accessToken: string;
      input: Parameters<DecideRegistration>[0];
    }[] = [];
    const { approveRegistration, revalidated } = makeHarness({
      decide: (input, accessToken) => {
        calls.push({ accessToken, input });
        return Effect.succeed({
          registrationId: RegistrationId.make("registration-1"),
          registrationStatus: "approval_processing",
        });
      },
    });

    await expect(
      approveRegistration({
        reason: "Looks good",
        registrationId: "registration-1",
      })
    ).resolves.toStrictEqual({
      _tag: "Success",
      success: {
        registrationId: "registration-1",
        registrationStatus: "approval_processing",
      },
    });
    expect(calls).toStrictEqual([
      {
        accessToken: "access-token",
        input: {
          decision: "approved",
          reason: "Looks good",
          registrationId: "registration-1",
        },
      },
    ]);
    expect(revalidated).toStrictEqual(["/admin/registration-approvals"]);
  });

  it("returns provider-neutral authorization failures without invoking the API", async () => {
    let decideCalled = false;
    const { rejectRegistration, revalidated } = makeHarness({
      decide: () => {
        decideCalled = true;
        return Effect.die("should not decide");
      },
      session: {
        permissions: ["registration.decide"],
      },
    });

    await expect(
      rejectRegistration({ registrationId: "registration-1" })
    ).resolves.toStrictEqual({
      _tag: "Failure",
      failure: {
        _tag: "RegistrationApiUnauthorized",
        category: "unauthenticated",
        code: "registration.unauthenticated",
        message: "Authentication is required.",
        recovery: "reauthenticate",
      },
    });
    expect(decideCalled).toBeFalsy();
    expect(revalidated).toStrictEqual([]);
  });

  it("returns the standard structural failure before invoking the API", async () => {
    let decideCalled = false;
    const { approveRegistration, revalidated } = makeHarness({
      decide: () => {
        decideCalled = true;
        return Effect.die("should not decide");
      },
    });

    await expect(
      approveRegistration({
        reason: "x".repeat(501),
        registrationId: "registration-1",
      })
    ).resolves.toStrictEqual({
      _tag: "Failure",
      failure: {
        _tag: "InputInvalid",
        category: "bad_input",
        code: "input.invalid",
        issues: [
          {
            message: "Invalid input.",
            path: ["reason"],
          },
        ],
        message: "Invalid input.",
        recovery: "fix_input",
      },
    });
    expect(decideCalled).toBeFalsy();
    expect(revalidated).toStrictEqual([]);
  });

  it("preserves the complete safe API projection", async () => {
    const { approveRegistration, revalidated } = makeHarness({
      decide: () =>
        Effect.fail(
          PublicRegistrationNotFoundFailure.make({
            message: "Registration not found",
          })
        ),
    });

    const result = await approveRegistration({
      registrationId: "registration-1",
    });

    expect(result).toStrictEqual({
      _tag: "Failure",
      failure: {
        _tag: "RegistrationNotFound",
        category: "not_found",
        code: "registration.notFound",
        message: "Registration not found",
        recovery: "refresh",
      },
    });
    expect(revalidated).toStrictEqual([]);
  });

  it("preserves generic decision conflicts separately from processing", async () => {
    const { rejectRegistration } = makeHarness({
      decide: () =>
        Effect.fail(
          PublicRegistrationConcurrentModificationFailure.make({
            message: "conflict",
          })
        ),
    });

    await expect(
      rejectRegistration({ registrationId: "registration-1" })
    ).resolves.toStrictEqual({
      _tag: "Failure",
      failure: {
        _tag: "RegistrationConcurrentModification",
        category: "conflict",
        code: "registration.conflict",
        message: "conflict",
        recovery: "refresh",
      },
    });
  });

  it("maps typed API availability failures to the public unavailable error", async () => {
    const { approveRegistration, revalidated } = makeHarness({
      decide: () =>
        Effect.fail(
          RegistrationApiErrorFailure.make({ message: "Service unavailable" })
        ),
    });

    const result = await approveRegistration({
      registrationId: "registration-1",
    });

    expect(result).toStrictEqual({
      _tag: "Failure",
      failure: {
        _tag: "RegistrationApiError",
        category: "unavailable",
        code: "registration.unavailable",
        message: "Service unavailable",
        recovery: "retry",
      },
    });
    expect(revalidated).toStrictEqual([]);
  });

  it("preserves an ambiguous decision outcome as refreshable", async () => {
    const { approveRegistration, revalidated } = makeHarness({
      decide: () =>
        Effect.fail(
          RegistrationDecisionOutcomeUnknownFailure.make({
            message: "Refresh before taking further action.",
            registrationId: RegistrationId.make("registration-1"),
          })
        ),
    });

    await expect(
      approveRegistration({ registrationId: "registration-1" })
    ).resolves.toStrictEqual({
      _tag: "Failure",
      failure: {
        _tag: "RegistrationDecisionOutcomeUnknown",
        category: "unavailable",
        code: "registration.decisionOutcomeUnknown",
        message: "Refresh before taking further action.",
        recovery: "refresh",
        registrationId: "registration-1",
      },
    });
    expect(revalidated).toStrictEqual([]);
  });

  it("rejects finalized statuses that the decision endpoint cannot return", async () => {
    const { approveRegistration, revalidated } = makeHarness({
      decide: () =>
        Effect.sync(() => {
          const decision = {
            registrationId: RegistrationId.make("registration-1"),
            registrationStatus: "approval_processing" as const,
          };
          Reflect.set(decision, "registrationStatus", "approved");
          return decision;
        }),
    });

    await expect(
      approveRegistration({ registrationId: "registration-1" })
    ).rejects.toThrow(/Expected "approval_processing"/u);
    expect(revalidated).toStrictEqual([]);
  });
});
