/* oxlint-disable max-classes-per-file, unicorn/throw-new-error -- The typed failure and its Effect service form one cohesive auth E2E contract. Schema.TaggedError is an error-class factory rather than an error throw. */
import type { Page } from "@repo/e2e-testing";
import { Context, Schema } from "effect";
import type { Effect } from "effect";

export interface AuthTestIdentity {
  readonly authUserId: string;
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
}

export interface CreateAuthTestIdentityInput {
  readonly email: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly permissions?: readonly string[];
}

export interface SignInAuthTestIdentityInput {
  readonly applicationUrl: string;
  readonly identity: AuthTestIdentity;
  readonly page: Page;
}

export class AuthTestFailure extends Schema.TaggedError<AuthTestFailure>()(
  "AuthTestFailure",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    operation: Schema.Literals([
      "createIdentity",
      "deleteIdentity",
      "revokeInvitations",
      "signIn",
    ]),
    provider: Schema.String,
  }
) {}

export class AuthTestControl extends Context.Service<
  AuthTestControl,
  {
    readonly createVerifiedIdentity: (
      input: CreateAuthTestIdentityInput
    ) => Effect.Effect<AuthTestIdentity, AuthTestFailure>;
    readonly deleteIdentity: (
      identity: AuthTestIdentity
    ) => Effect.Effect<void, AuthTestFailure>;
    readonly revokePendingInvitationsFor: (
      email: string
    ) => Effect.Effect<void, AuthTestFailure>;
    readonly signIn: (
      input: SignInAuthTestIdentityInput
    ) => Effect.Effect<void, AuthTestFailure>;
  }
>()("@repo/auth-contract/e2e/AuthTestControl") {}
