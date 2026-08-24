import {
  AccessTokenInvalid,
  AccessTokenVerificationFailure,
  AccessTokenVerifier,
  AuthUserId,
  VerifiedAccessToken,
  authPermissionsFrom,
  validateRequiredAccessTokenPermissions,
} from "@repo/auth-contract/access-token";
import { hasTransientTransportCode } from "@repo/errors/transport";
import { WorkOS } from "@workos-inc/node";
import { Config, Effect, Layer, Option, Schema } from "effect";
import type { FetchImplementation } from "jose";
import { createRemoteJWKSet, customFetch, jwtVerify } from "jose";

export {
  AccessTokenInvalid,
  AccessTokenVerificationFailure,
  AccessTokenVerifier,
  AuthUserId,
  VerifiedAccessToken,
  authPermissionsFrom,
  validateRequiredAccessTokenPermissions,
} from "@repo/auth-contract/access-token";

const DEFAULT_WORKOS_API_HOSTNAME = "api.workos.com";
const WORKOS_JWKS_COOLDOWN_DURATION_MS = 300_000;
const HTTP_REQUEST_TIMEOUT = 408;
const HTTP_TOO_MANY_REQUESTS = 429;
const HTTP_SERVER_ERROR_MINIMUM = 500;
const WORKOS_JWKS_UNAVAILABLE_CODE = "WORKOS_JWKS_UNAVAILABLE";
const trailingSlashesPattern = /\/+$/u;
const INVALID_TOKEN_JOSE_CODES = new Set([
  "ERR_JWKS_MULTIPLE_MATCHING_KEYS",
  "ERR_JWKS_NO_MATCHING_KEY",
]);

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
  sub: AuthUserId,
});

// oxlint-disable-next-line anti-slop/no-unknown-returns -- The provider result is decoded by WorkosAccessTokenPayload immediately after verification.
export type AccessTokenJwtVerifier = (token: string) => Promise<unknown>;

export interface AccessTokenVerifierOptions {
  readonly expectedClientId?: string;
  readonly expectedIssuer?: string;
  readonly requiredPermissions?: readonly string[];
  readonly verifyAccessToken: AccessTokenJwtVerifier;
}

export interface AccessTokenVerifierLayerOptions {
  readonly configPrefix?: string;
  readonly requiredPermissions?: readonly string[];
}

const configKey = (prefix: string | undefined, key: string) =>
  prefix === undefined || prefix === "" ? key : `${prefix}_${key}`;

// oxlint-disable-next-line anti-slop/no-unknown-parameters -- This function is the Schema decoding boundary for the external verifier result.
const decodeVerifiedPayload = (payload: unknown) =>
  Schema.decodeUnknownEffect(WorkosAccessTokenPayload)(payload).pipe(
    Effect.mapError(
      () =>
        new AccessTokenInvalid({
          message: "WorkOS access token does not contain required claims",
          reason: "invalidClaims",
        })
    )
  );

const invalidToken = () =>
  new AccessTokenInvalid({
    message: "Invalid WorkOS access token",
    reason: "invalidToken",
  });

const invalidIssuer = () =>
  new AccessTokenInvalid({
    message: "WorkOS access token issuer does not match this application",
    reason: "invalidIssuer",
  });

const invalidAudience = () =>
  new AccessTokenInvalid({
    message: "WorkOS access token audience does not match this application",
    reason: "invalidAudience",
  });

const isVerificationUnavailable = (cause: unknown) =>
  hasTransientTransportCode(cause, [
    "ERR_JWKS_TIMEOUT",
    WORKOS_JWKS_UNAVAILABLE_CODE,
  ]);

const toVerifyAccessTokenError = (cause: unknown) =>
  new AccessTokenVerificationFailure({
    cause,
    message: "Failed to verify WorkOS access token",
    reason: isVerificationUnavailable(cause) ? "unavailable" : "unexpected",
  });

const isInvalidTokenJoseError = (
  cause: unknown
): cause is Error & { readonly code: string } =>
  cause instanceof Error &&
  "code" in cause &&
  Schema.is(Schema.String)(cause.code) &&
  (cause.code.startsWith("ERR_JWT_") ||
    cause.code.startsWith("ERR_JWS_") ||
    INVALID_TOKEN_JOSE_CODES.has(cause.code));

const toAccessTokenVerificationError = (cause: unknown) =>
  isInvalidTokenJoseError(cause)
    ? invalidToken()
    : toVerifyAccessTokenError(cause);

const isUnavailableJwksStatus = (status: number) =>
  status === HTTP_REQUEST_TIMEOUT ||
  status === HTTP_TOO_MANY_REQUESTS ||
  status >= HTTP_SERVER_ERROR_MINIMUM;

export const fetchWorkosJwks: FetchImplementation = async (url, options) => {
  const response = await fetch(url, options);

  if (isUnavailableJwksStatus(response.status)) {
    throw Object.assign(
      new Error(`WorkOS JWKS request failed with status ${response.status}`),
      {
        code: WORKOS_JWKS_UNAVAILABLE_CODE,
        status: response.status,
      }
    );
  }

  return response;
};

const normalizeIssuer = (issuer: string) =>
  issuer.replace(trailingSlashesPattern, "");

const hasExpectedAudience = (
  payload: typeof WorkosAccessTokenPayload.Type,
  expectedClientId: string
) => {
  if (payload.client_id !== undefined) {
    return payload.client_id === expectedClientId;
  }

  if (Schema.is(Schema.String)(payload.aud)) {
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
}: AccessTokenVerifierOptions) =>
  AccessTokenVerifier.of({
    verify: Effect.fn("AccessTokenVerifier.verify")((token) =>
      Effect.tryPromise({
        catch: toAccessTokenVerificationError,
        try: async () => await verifyAccessToken(token),
      }).pipe(
        Effect.flatMap(decodeVerifiedPayload),
        Effect.flatMap((payload) =>
          validateTrustedClaims(payload, {
            expectedClientId,
            expectedIssuer,
          })
        ),
        Effect.map((payload) => {
          const verifiedTokenFields = {
            authUserId: payload.sub,
            permissions: authPermissionsFrom(payload.permissions ?? []),
          };

          return payload.sid === undefined
            ? Schema.decodeSync(VerifiedAccessToken)(verifiedTokenFields)
            : Schema.decodeSync(VerifiedAccessToken)({
                ...verifiedTokenFields,
                sessionId: payload.sid,
              });
        }),
        Effect.flatMap((verifiedToken) =>
          validateRequiredAccessTokenPermissions(
            verifiedToken,
            requiredPermissions
          )
        )
      )
    ),
  });

export const accessTokenVerifierLayerFromJwtVerifier = (
  options: AccessTokenVerifierOptions
) => Layer.succeed(AccessTokenVerifier, makeWorkosAccessTokenVerifier(options));

export const accessTokenVerifierLayer = ({
  configPrefix,
  requiredPermissions = [],
}: AccessTokenVerifierLayerOptions = {}) =>
  Layer.effect(
    AccessTokenVerifier,
    Effect.gen(function* () {
      const clientId = yield* Config.string(
        configKey(configPrefix, "WORKOS_CLIENT_ID")
      );
      const apiHostname = yield* Config.option(
        Config.string(configKey(configPrefix, "WORKOS_API_HOSTNAME"))
      ).pipe(Effect.map(Option.getOrUndefined));
      const expectedIssuer = yield* Config.option(
        Config.string(configKey(configPrefix, "WORKOS_ACCESS_TOKEN_ISSUER"))
      ).pipe(
        Effect.map(
          Option.getOrElse(
            () => `https://${apiHostname ?? DEFAULT_WORKOS_API_HOSTNAME}`
          )
        )
      );
      const workos = apiHostname
        ? new WorkOS({ apiHostname, clientId })
        : new WorkOS({ clientId });
      const jwks = createRemoteJWKSet(
        new URL(workos.userManagement.getJwksUrl(clientId)),
        {
          cooldownDuration: WORKOS_JWKS_COOLDOWN_DURATION_MS,
          [customFetch]: fetchWorkosJwks,
        }
      );

      return makeWorkosAccessTokenVerifier({
        expectedClientId: clientId,
        expectedIssuer,
        requiredPermissions,
        verifyAccessToken: async (token) =>
          await jwtVerify(token, jwks).then(({ payload }) => payload),
      });
    })
  );
