import { RegistrationId } from "@repo/registration";
import {
  RegistrationApiConflict,
  RegistrationApiError,
  RegistrationApiNotFound,
} from "@repo/registration/http/registration-api";
import { Effect } from "effect";
import { beforeEach, describe, expect, it, vi } from "vitest";

const boundary = vi.hoisted(() => ({
  accessToken: "access-token" as string | undefined,
  decide:
    vi.fn<(...args: readonly unknown[]) => Effect.Effect<unknown, unknown>>(),
  permissions: ["registration.decide"] as readonly string[],
  revalidatePath: vi.fn<(path: string) => void>(),
  userId: "user-1" as string | undefined,
}));

vi.mock("server-only", () => ({}));
vi.mock("@repo/auth/server", () => ({ withAuth: vi.fn<() => void>() }));
vi.mock("@repo/i18n", () => ({ getLocale: () => "en-US" }));
vi.mock("next/headers", () => ({ cookies: vi.fn<() => void>() }));
vi.mock("next/server", () => ({ connection: vi.fn<() => void>() }));
vi.mock("./admin-registration", () => ({
  decideAdminRegistration: boundary.decide,
}));
vi.mock("./app-runtime", async () => {
  const { NextServer } = await import("@repo/actions/next-server");
  const {
    Effect: TestEffect,
    Layer,
    ManagedRuntime,
    Redacted,
  } = await import("effect");
  const { CurrentAuth } = await import("./current-auth");
  const { NextRequestApi } = await import("./next-request");
  const testLayer = Layer.mergeAll(
    Layer.succeed(CurrentAuth, {
      snapshot: TestEffect.sync(() => ({
        permissions: boundary.permissions,
        ...(boundary.accessToken === undefined
          ? {}
          : { accessToken: Redacted.make(boundary.accessToken) }),
        ...(boundary.userId === undefined ? {} : { userId: boundary.userId }),
      })),
    }),
    Layer.succeed(NextRequestApi, {
      connect: () => TestEffect.void,
      getCookies: () => TestEffect.die("not used"),
      getLocale: () => TestEffect.succeed("en-US" as const),
    }),
    Layer.succeed(NextServer, {
      revalidatePath: (path) =>
        TestEffect.sync(() => boundary.revalidatePath(path)),
    })
  );

  return { AppRuntime: ManagedRuntime.make(testLayer) };
});

const { approveRegistration, rejectRegistration } =
  await import("./admin-registration-actions");

describe("admin registration actions", () => {
  beforeEach(() => {
    boundary.accessToken = "access-token";
    boundary.decide.mockReset();
    boundary.permissions = ["registration.decide"];
    boundary.revalidatePath.mockClear();
    boundary.userId = "user-1";
  });

  it("provides authenticated access, encodes success, and revalidates", async () => {
    boundary.decide.mockReturnValue(
      Effect.succeed({
        registrationId: RegistrationId.make("registration-1"),
        registrationStatus: "approval_processing",
      })
    );

    await expect(
      approveRegistration({
        reason: "Looks good",
        registrationId: "registration-1",
      })
    ).resolves.toEqual({
      _tag: "Success",
      success: {
        registrationId: "registration-1",
        registrationStatus: "approval_processing",
      },
    });
    expect(boundary.decide).toHaveBeenCalledWith(
      {
        decision: "approved",
        reason: "Looks good",
        registrationId: "registration-1",
      },
      "access-token"
    );
    expect(boundary.revalidatePath).toHaveBeenCalledWith(
      "/admin/registration-approvals"
    );
  });

  it("returns provider-neutral authorization failures without invoking the API", async () => {
    boundary.accessToken = undefined;
    boundary.userId = undefined;

    await expect(
      rejectRegistration({ registrationId: "registration-1" })
    ).resolves.toEqual({
      _tag: "Failure",
      failure: { _tag: "RegistrationApiUnauthorized" },
    });
    expect(boundary.decide).not.toHaveBeenCalled();
    expect(boundary.revalidatePath).not.toHaveBeenCalled();
  });

  it("returns the standard structural failure before invoking the API", async () => {
    await expect(
      approveRegistration({
        reason: "x".repeat(501),
        registrationId: "registration-1",
      })
    ).resolves.toEqual({
      _tag: "Failure",
      failure: {
        _tag: "ActionInputInvalid",
        issues: [
          {
            path: ["reason"],
            message: "Invalid input.",
          },
        ],
      },
    });
    expect(boundary.decide).not.toHaveBeenCalled();
    expect(boundary.revalidatePath).not.toHaveBeenCalled();
  });

  it("preserves safe API tags while removing diagnostic messages", async () => {
    boundary.decide.mockReturnValue(
      Effect.fail(
        new RegistrationApiNotFound({ message: "private API diagnostic" })
      )
    );

    const result = await approveRegistration({
      registrationId: "registration-1",
    });

    expect(result).toEqual({
      _tag: "Failure",
      failure: { _tag: "RegistrationApiNotFound" },
    });
    expect(JSON.stringify(result)).not.toContain("private API diagnostic");
    expect(boundary.revalidatePath).not.toHaveBeenCalled();
  });

  it("preserves generic decision conflicts separately from processing", async () => {
    boundary.decide.mockReturnValue(
      Effect.fail(new RegistrationApiConflict({ message: "conflict" }))
    );

    await expect(
      rejectRegistration({ registrationId: "registration-1" })
    ).resolves.toEqual({
      _tag: "Failure",
      failure: { _tag: "RegistrationDecisionConflict" },
    });
  });

  it("maps typed API availability failures to the public unavailable error", async () => {
    boundary.decide.mockReturnValue(
      Effect.fail(new RegistrationApiError({ message: "private diagnostic" }))
    );

    const result = await approveRegistration({
      registrationId: "registration-1",
    });

    expect(result).toEqual({
      _tag: "Failure",
      failure: { _tag: "RegistrationDecisionUnavailable" },
    });
    expect(JSON.stringify(result)).not.toContain("private diagnostic");
    expect(boundary.revalidatePath).not.toHaveBeenCalled();
  });

  it("rejects finalized statuses that the decision endpoint cannot return", async () => {
    boundary.decide.mockReturnValue(
      Effect.succeed({
        registrationId: RegistrationId.make("registration-1"),
        registrationStatus: "approved",
      })
    );

    await expect(
      approveRegistration({ registrationId: "registration-1" })
    ).rejects.toThrow();
    expect(boundary.revalidatePath).not.toHaveBeenCalled();
  });
});
