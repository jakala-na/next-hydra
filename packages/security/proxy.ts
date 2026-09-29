import nosecone, { defaults, withVercelToolbar } from "@nosecone/next";
import type { NoseconeOptions } from "@nosecone/next";
import { NextResponse } from "next/server";

export type { NoseconeOptions } from "@nosecone/next";

export function resolveFrameAncestors(
  providerOrigins: readonly string[],
  additionalOrigins: readonly string[]
): string[] {
  return [...new Set(["'self'", ...providerOrigins, ...additionalOrigins])];
}

// Nosecone security headers configuration
// https://docs.arcjet.com/nosecone/quick-start
export const noseconeOptions: NoseconeOptions = {
  ...defaults,
  // Each application supplies its CSP when composing its proxies.
  contentSecurityPolicy: false,
};

export const noseconeOptionsWithToolbar: NoseconeOptions =
  withVercelToolbar(noseconeOptions);

export function noseconeProxy(options: NoseconeOptions = noseconeOptions) {
  // NEMO recognizes NextResponse.next() as continuation. Nosecone's native
  // middleware returns a plain Response, which NEMO treats as terminal.
  return () => NextResponse.next({ headers: nosecone(options) });
}
