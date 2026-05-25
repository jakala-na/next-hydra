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

  constructor(status: number) {
    super(`Registration REST request failed with ${status}`);
    this.status = status;
  }
}

export async function fetchRegistrationRest<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(registrationRestUrl(path), {
    ...init,
    headers: {
      accept: "application/json",
      ...(init?.body ? { "content-type": "application/json" } : {}),
      ...init?.headers,
    },
  });

  if (!response.ok) {
    throw new RegistrationRestError(response.status);
  }

  return (await response.json()) as T;
}
