import { getSessionToken } from "@drupal-canvas/headless";
import type { DraftData } from "@drupal-canvas/headless";
import type { CanvasComponentTreeElement } from "@drupal-canvas/headless/server";
import { z } from "zod";

const TRAILING_SLASH = /\/$/;

export type CanvasCacheability = {
  tags: string[];
  contexts: string[];
  maxAge: number;
};

export type CanvasGlobalRegionsResult = {
  cacheability: CanvasCacheability;
  regions: Record<string, CanvasComponentTreeElement | null>;
  theme: string;
};

const canvasGlobalRegionsResultSchema = z.object({
  cacheability: z.object({
    contexts: z.array(z.string()),
    maxAge: z.number().int(),
    tags: z.array(z.string()),
  }),
  regions: z.record(
    z.string(),
    z.union([z.object({ element: z.string() }).passthrough(), z.null()])
  ),
  theme: z.string(),
});

/** Fetches all locale-aware Canvas PageRegions from Drupal. */
export async function fetchCanvasGlobalRegions(
  path: string,
  options: {
    baseUrl: string;
    draftData?: DraftData | null;
    fetchImpl?: typeof fetch;
  }
): Promise<CanvasGlobalRegionsResult | null> {
  const { baseUrl, draftData, fetchImpl = fetch } = options;
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = draftData ? getSessionToken(draftData) : null;
  if (token) {
    headers.Authorization = `${token.tokenType} ${token.value}`;
  }

  const url = new URL(path, `${baseUrl.replace(TRAILING_SLASH, "")}/`);
  let response: Response;
  try {
    response = await fetchImpl(url, {
      cache: "no-store",
      headers,
    });
  } catch {
    return null;
  }

  if (!response.ok) {
    return null;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    return null;
  }
  const parsed = canvasGlobalRegionsResultSchema.safeParse(payload);
  if (!parsed.success) {
    return null;
  }
  const result = parsed.data as CanvasGlobalRegionsResult;
  if (!token) {
    return result;
  }

  return {
    ...result,
    regions: Object.fromEntries(
      Object.entries(result.regions).map(([name, content]) => [
        name,
        content === null ? null : { ...content, canvasDraftMode: true },
      ])
    ),
  };
}
