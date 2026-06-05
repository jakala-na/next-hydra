import { WorkOS } from "@workos-inc/node";
import { Config, Context, Effect, Layer, Option, Schema } from "effect";
import { createRemoteJWKSet, jwtVerify } from "jose";

export const WorkosAuthUserId = Schema.NonEmptyString.pipe(
  Schema.brand("WorkosAuthUserId")
);
export type WorkosAuthUserId = typeof WorkosAuthUserId.Type;

export class VerifiedWorkosAccessToken extends Schema.Class<VerifiedWorkosAccessToken>(
  "VerifiedWorkosAccessToken"
)({
  authUserId: WorkosAuthUserId,
  sessionId: Schema.optional(Schema.NonEmptyString),
  permissions: Schema.optional(Schema.Array(Schema.String)),
}) {}

export class WorkosAccessTokenInvalid extends Schema.TaggedErrorClass<WorkosAccessTokenInvalid>()(
  "WorkosAccessTokenInvalid",
  {
    message: Schema.String,
    reason: Schema.Literals([
      "invalidToken",
      "invalidClaims",
      "invalidIssuer",
      "invalidAudience",
      "missingRequiredPermission",
    ]),
  }
) {}

export class WorkosAccessTokenVerificationFailure extends Schema.TaggedErrorClass<WorkosAccessTokenVerificationFailure>()(
  "WorkosAccessTokenVerificationFailure",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Defect),
  }
) {}

const DEFAULT_WORKOS_API_HOSTNAME = "api.workos.com";
const WORKOS_JWKS_COOLDOWN_DURATION_MS = 300_000;
const trailingSlashesPattern = /\/+$/;

const WorkosAccessTokenAudience = Schema.Union([
  Schema.NonEmptyString,
  Schema.Array(Schema.NonEmptyString),
]);

const WorkosAccessTokenPayload = Schema.Struct({
  aud: Schema.optional(WorkosAccessTokenAudience),
  client_id: Schema.optional(Schema.NonEmptyString),
  iss: Schema.optional(Schema.NonEmptyString),
  permissions: Schema.optional(Schema.Array(Schema.String)),
  sid: Schema.optional(Schema.NonEmptyString),
  sub: WorkosAuthUserId,
});

export type WorkosAccessTokenJwtVerifier = (token: string) => Promise<unknown>;

export interface WorkosAccessTokenVerifierOptions {
  readonly expectedClientId?: string;
  readonly expectedIssuer?: string;
  readonly requiredPermissions?: readonly string[];
  readonly verifyAccessToken: WorkosAccessTokenJwtVerifier;
}

const decodeVerifiedPayload = (payload: unknown) =>
  Schema.decodeUnknownEffect(WorkosAccessTokenPayload)(payload).pipe(
    Effect.mapError(
      () =>
        new WorkosAccessTokenInvalid({
          message: "WorkOS access token does not contain required claims",
          reason: "invalidClaims",
        })
    )
  );

const validateRequiredPermissions = (
  token: VerifiedWorkosAccessToken,
  requiredPermissions: readonly string[]
) => {
  const grantedPermissions = token.permissions ?? [];
  const missingPermission = requiredPermissions.find(
    (permission) => !grantedPermissions.includes(permission)
  );

  if (missingPermission) {
    return Effect.fail(
      new WorkosAccessTokenInvalid({
        message: `WorkOS access token is missing required permission ${missingPermission}`,
        reason: "missingRequiredPermission",
      })
    );
  }

  return Effect.succeed(token);
};

const invalidToken = () =>
  new WorkosAccessTokenInvalid({
    message: "Invalid WorkOS access token",
    reason: "invalidToken",
  });

const invalidIssuer = () =>
  new WorkosAccessTokenInvalid({
    message: "WorkOS access token issuer does not match this application",
    reason: "invalidIssuer",
  });

const invalidAudience = () =>
  new WorkosAccessTokenInvalid({
    message: "WorkOS access token audience does not match this application",
    reason: "invalidAudience",
  });

const toVerifyAccessTokenError = (cause: unknown) =>
  new WorkosAccessTokenVerificationFailure({
    message: "Failed to verify WorkOS access token",
    cause,
  });

const isJoseJwtError = (
  cause: unknown
): cause is Error & { readonly code: string } =>
  cause instanceof Error &&
  "code" in cause &&
  typeof cause.code === "string" &&
  (cause.code.startsWith("ERR_JWT_") || cause.code.startsWith("ERR_JWS_"));

const toAccessTokenVerificationError = (cause: unknown) =>
  isJoseJwtError(cause) ? invalidToken() : toVerifyAccessTokenError(cause);

const normalizeIssuer = (issuer: string) =>
  issuer.replace(trailingSlashesPattern, "");

const hasExpectedAudience = (
  payload: typeof WorkosAccessTokenPayload.Type,
  expectedClientId: string
) => {
  if (payload.client_id !== undefined) {
    return payload.client_id === expectedClientId;
  }

  if (typeof payload.aud === "string") {
    return payload.aud === expectedClientId;
  }

  return payload.aud?.includes(expectedClientId) ?? false;
};

const validateTrustedClaims = (
  payload: typeof WorkosAccessTokenPayload.Type,
  options: {
    readonly expectedClientId?: string;
    readonly expectedIssuer?: string;
  }
) => {
  if (
    options.expectedIssuer &&
    normalizeIssuer(payload.iss ?? "") !==
      normalizeIssuer(options.expectedIssuer)
  ) {
    return Effect.fail(invalidIssuer());
  }

  if (
    options.expectedClientId &&
    !hasExpectedAudience(payload, options.expectedClientId)
  ) {
    return Effect.fail(invalidAudience());
  }

  return Effect.succeed(payload);
};

const makeWorkosAccessTokenVerifier = ({
  expectedClientId,
  expectedIssuer,
  requiredPermissions = [],
  verifyAccessToken,
}: WorkosAccessTokenVerifierOptions) =>
  WorkosAccessTokenVerifier.of({
    verify: Effect.fn("WorkosAccessTokenVerifier.verify")((token) =>
      Effect.tryPromise({
        try: () => verifyAccessToken(token),
        catch: toAccessTokenVerificationError,
      }).pipe(
        Effect.flatMap(decodeVerifiedPayload),
        Effect.flatMap((payload) =>
          validateTrustedClaims(payload, {
            expectedClientId,
            expectedIssuer,
          })
        ),
        Effect.map(
          (payload) =>
            new VerifiedWorkosAccessToken({
              authUserId: payload.sub,
              ...(payload.sid === undefined ? {} : { sessionId: payload.sid }),
              ...(payload.permissions === undefined
                ? {}
                : { permissions: payload.permissions }),
            })
        ),
        Effect.flatMap((verifiedToken) =>
          validateRequiredPermissions(verifiedToken, requiredPermissions)
        )
      )
    ),
  });

export const layerWorkosAccessTokenVerifierFromJwtVerifier = (
  options: WorkosAccessTokenVerifierOptions
) =>
  Layer.succeed(
    WorkosAccessTokenVerifier,
    makeWorkosAccessTokenVerifier(options)
  );

export const layerWorkosAccessTokenVerifier = ({
  requiredPermissions = [],
}: {
  readonly requiredPermissions?: readonly string[];
} = {}) =>
  Layer.effect(
    WorkosAccessTokenVerifier,
    Effect.gen(function* () {
      const clientId = yield* Config.string("WORKOS_CLIENT_ID");
      const apiHostname = yield* Config.option(
        Config.string("WORKOS_API_HOSTNAME")
      ).pipe(Effect.map(Option.getOrUndefined));
      const expectedIssuer = yield* Config.option(
        Config.string("WORKOS_ACCESS_TOKEN_ISSUER")
      ).pipe(
        Effect.map(
          Option.getOrElse(
            () => `https://${apiHostname ?? DEFAULT_WORKOS_API_HOSTNAME}`
          )
        )
      );
      const workos = new WorkOS({
        clientId,
        ...(apiHostname ? { apiHostname } : {}),
      });
      const jwks = createRemoteJWKSet(
        new URL(workos.userManagement.getJwksUrl(clientId)),
        { cooldownDuration: WORKOS_JWKS_COOLDOWN_DURATION_MS }
      );

      return makeWorkosAccessTokenVerifier({
        expectedClientId: clientId,
        expectedIssuer,
        requiredPermissions,
        verifyAccessToken: (token) =>
          jwtVerify(token, jwks).then(({ payload }) => payload),
      });
    })
  );

export class WorkosAccessTokenVerifier extends Context.Service<
  WorkosAccessTokenVerifier,
  {
    readonly verify: (
      token: string
    ) => Effect.Effect<
      VerifiedWorkosAccessToken,
      WorkosAccessTokenInvalid | WorkosAccessTokenVerificationFailure
    >;
  }
>()("@repo/auth-workos/WorkosAccessTokenVerifier") {}
