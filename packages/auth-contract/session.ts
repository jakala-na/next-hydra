/* oxlint-disable max-classes-per-file, unicorn/throw-new-error, anti-slop/no-runtime-typeof, promise/prefer-await-to-callbacks -- The session DTOs, typed failure, reader service, and provider-reader constructor form one public auth contract. The typeof checks implement the declared Schema boundary for the behavioral permission adapter, and Effect combinators use callback APIs to transform Effects. */
import { Context, Effect, Schema } from "effect";

export interface AuthPermissionAdapter {
  readonly has: (permission: string) => boolean;
}

export const AuthPermissionAdapterSchema =
  Schema.declare<AuthPermissionAdapter>(
    (value): value is AuthPermissionAdapter =>
      typeof value === "object" &&
      value !== null &&
      "has" in value &&
      typeof value.has === "function",
    { identifier: "AuthPermissionAdapter" }
  );

export class AuthUser extends Schema.Class<AuthUser>("AuthUser")({
  email: Schema.NullOr(Schema.String),
  firstName: Schema.NullOr(Schema.String),
  id: Schema.NonEmptyString,
  lastName: Schema.NullOr(Schema.String),
  profilePictureUrl: Schema.NullOr(Schema.String),
}) {}

export class AuthSession extends Schema.Class<AuthSession>("AuthSession")({
  accessToken: Schema.optional(Schema.NonEmptyString),
  permissions: AuthPermissionAdapterSchema,
  sessionId: Schema.optional(Schema.NonEmptyString),
  user: Schema.NullOr(AuthUser),
}) {}

export const AuthRoutes = Schema.Struct({
  signInHref: Schema.NonEmptyString,
  signOutHref: Schema.NonEmptyString,
  signUpHref: Schema.optional(Schema.NonEmptyString),
});
export type AuthRoutes = typeof AuthRoutes.Type;

export class AuthSessionReadFailure extends Schema.TaggedError<AuthSessionReadFailure>()(
  "AuthSessionReadFailure",
  {
    cause: Schema.Defect(),
    message: Schema.String,
    provider: Schema.String,
  }
) {}

export class AuthSessionAdapter extends Context.Service<
  AuthSessionAdapter,
  {
    readonly read: Effect.Effect<AuthSession, AuthSessionReadFailure>;
  }
>()("@repo/auth/AuthSessionAdapter") {
  static readonly read = AuthSessionAdapter.pipe(
    Effect.flatMap((adapter) => adapter.read)
  );
}

export const makeAuthSessionAdapter = <Source>({
  decode,
  failureMessage,
  provider,
  read,
}: {
  readonly decode: (source: Source) => AuthSession;
  readonly failureMessage: string;
  readonly provider: string;
  readonly read: () => Promise<Source>;
}) =>
  AuthSessionAdapter.of({
    read: Effect.tryPromise({
      catch: (cause) =>
        new AuthSessionReadFailure({
          cause,
          message: failureMessage,
          provider,
        }),
      try: read,
    }).pipe(Effect.map(decode)),
  });
