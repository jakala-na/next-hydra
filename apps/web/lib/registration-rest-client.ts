import "server-only";

import { env } from "@/env";

const TRAILING_SLASH_PATTERN = /\/$/;

const apiBaseUrl = (env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002").replace(
  TRAILING_SLASH_PATTERN,
  ""
);

export const registrationRestUrl = (path: string) =>
  `${apiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;

export class RegistrationRestError extends Error {
  readonly status: number;
  readonly body: unknown;

  constructor(status: number, body: unknown) {
    super(`Registration REST request failed with ${status}`);
    this.status = status;
    this.body = body;
  }
}

export async function fetchRegistrationRest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(registrationRestUrl(path), {
    cache: "no-store",
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => undefined);
    throw new RegistrationRestError(response.status, body);
  }

  return (await response.json()) as T;
}
