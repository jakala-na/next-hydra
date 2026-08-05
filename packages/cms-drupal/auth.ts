import { type DrupalKeys, getDrupalAuthUri, keys } from "./keys.ts";

export type DrupalAccessMode = "previewer" | "viewer";

type DrupalCredentials = {
  readonly clientId: string;
  readonly clientSecret: string;
};

type TokenCacheEntry = {
  readonly authorization: string;
  readonly expiresAt: number;
};

type DrupalTokenProviderOptions = {
  readonly authUri: string;
  readonly credentials: Readonly<Record<DrupalAccessMode, DrupalCredentials>>;
  readonly fetchImplementation?: typeof fetch;
  readonly now?: () => number;
};

type DrupalTokenPayload = {
  readonly access_token?: unknown;
  readonly error?: unknown;
  readonly error_description?: unknown;
  readonly expires_in?: unknown;
  readonly token_type?: unknown;
};

const TOKEN_EXPIRY_SKEW_MS = 30_000;
const DEFAULT_TOKEN_LIFETIME_SECONDS = 300;
const MILLISECONDS_PER_SECOND = 1000;

export class DrupalAuthenticationError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = "DrupalAuthenticationError";
    this.status = status;
  }
}

function credentialsFromKeys(
  config: DrupalKeys
): Readonly<Record<DrupalAccessMode, DrupalCredentials>> {
  return {
    previewer: {
      clientId: config.DRUPAL_PREVIEWER_CLIENT_ID,
      clientSecret: config.DRUPAL_PREVIEWER_CLIENT_SECRET,
    },
    viewer: {
      clientId: config.DRUPAL_VIEWER_CLIENT_ID,
      clientSecret: config.DRUPAL_VIEWER_CLIENT_SECRET,
    },
  };
}

function errorMessage(payload: DrupalTokenPayload): string {
  if (typeof payload.error_description === "string") {
    return payload.error_description;
  }
  if (typeof payload.error === "string") {
    return payload.error;
  }
  return "Drupal OAuth did not return an access token";
}

export function createDrupalTokenProvider({
  authUri,
  credentials,
  fetchImplementation = globalThis.fetch,
  now = Date.now,
}: DrupalTokenProviderOptions): (mode: DrupalAccessMode) => Promise<string> {
  const cache = new Map<DrupalAccessMode, TokenCacheEntry>();
  const pending = new Map<DrupalAccessMode, Promise<string>>();

  const requestToken = async (mode: DrupalAccessMode) => {
    const credential = credentials[mode];
    const response = await fetchImplementation(authUri, {
      body: new URLSearchParams({
        client_id: credential.clientId,
        client_secret: credential.clientSecret,
        grant_type: "client_credentials",
      }),
      headers: {
        "content-type": "application/x-www-form-urlencoded",
      },
      method: "POST",
    });
    const payload = (await response
      .json()
      .catch(() => ({}))) as DrupalTokenPayload;

    if (
      !response.ok ||
      typeof payload.access_token !== "string" ||
      payload.access_token.length === 0
    ) {
      throw new DrupalAuthenticationError(
        errorMessage(payload),
        response.status
      );
    }

    const tokenType =
      typeof payload.token_type === "string" ? payload.token_type : "Bearer";
    const expiresIn =
      typeof payload.expires_in === "number"
        ? payload.expires_in
        : DEFAULT_TOKEN_LIFETIME_SECONDS;
    const authorization = `${tokenType} ${payload.access_token}`;
    cache.set(mode, {
      authorization,
      expiresAt: now() + expiresIn * MILLISECONDS_PER_SECOND,
    });
    return authorization;
  };

  return (mode: DrupalAccessMode): Promise<string> => {
    const cached = cache.get(mode);
    if (cached && cached.expiresAt - TOKEN_EXPIRY_SKEW_MS > now()) {
      return Promise.resolve(cached.authorization);
    }

    const inFlight = pending.get(mode);
    if (inFlight) {
      return inFlight;
    }

    const tokenRequest = requestToken(mode).finally(() => {
      pending.delete(mode);
    });
    pending.set(mode, tokenRequest);
    return tokenRequest;
  };
}

let runtimeTokenProvider:
  | ReturnType<typeof createDrupalTokenProvider>
  | undefined;

export function getDrupalAccessToken(mode: DrupalAccessMode): Promise<string> {
  if (!runtimeTokenProvider) {
    const config = keys();
    runtimeTokenProvider = createDrupalTokenProvider({
      authUri: getDrupalAuthUri(config),
      credentials: credentialsFromKeys(config),
    });
  }
  return runtimeTokenProvider(mode);
}
