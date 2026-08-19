import "server-only";
import { z } from "zod";

import { keys } from "../keys";
import { isSafeDrupalPreviewPath } from "./preview-context";
import type { DrupalNextPreviewContext } from "./preview-context";

const NEXT_DRUPAL_PREVIEW_PLUGIN = "simple_oauth";
const ID_RESOURCE_VERSION_PREFIX = "id:";
const LATEST_VERSION = "rel:working-copy";
const CURRENT_VERSION = "rel:latest-version";
const SERVER_ERROR_STATUS = 500;

const validatedDraftSchema = z.object({
  path: z.string().refine(isSafeDrupalPreviewPath),
});

export class NextDrupalPreviewValidationError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "NextDrupalPreviewValidationError";
  }
}

export function isNextDrupalPreviewRequest(
  searchParams: URLSearchParams
): boolean {
  return ["path", "plugin", "secret", "timestamp"].every((name) =>
    searchParams.has(name)
  );
}

export function toGraphqlRevision(
  resourceVersion: string | null
): string | null | undefined {
  if (!resourceVersion) {
    return null;
  }
  if (resourceVersion === LATEST_VERSION) {
    return "latest";
  }
  if (resourceVersion === CURRENT_VERSION) {
    return "current";
  }
  if (resourceVersion.startsWith(ID_RESOURCE_VERSION_PREFIX)) {
    const revision = resourceVersion.slice(ID_RESOURCE_VERSION_PREFIX.length);
    return revision || undefined;
  }
}

export async function validateNextDrupalPreview(
  searchParams: URLSearchParams
): Promise<DrupalNextPreviewContext | undefined> {
  if (
    !isNextDrupalPreviewRequest(searchParams) ||
    searchParams.get("plugin") !== NEXT_DRUPAL_PREVIEW_PLUGIN
  ) {
    return;
  }

  const revision = toGraphqlRevision(searchParams.get("resourceVersion"));
  if (revision === undefined) {
    return;
  }

  let response: Response;
  try {
    response = await fetch(new URL("/next/draft-url", keys().DRUPAL_BASE_URL), {
      body: JSON.stringify(Object.fromEntries(searchParams.entries())),
      headers: {
        accept: "application/vnd.api+json",
        "content-type": "application/json",
      },
      method: "POST",
    });
  } catch (error) {
    throw new NextDrupalPreviewValidationError(
      "Failed to request Next.js for Drupal preview validation",
      { cause: error }
    );
  }

  if (response.status >= SERVER_ERROR_STATUS) {
    throw new NextDrupalPreviewValidationError(
      `Next.js for Drupal preview validation returned ${response.status}`
    );
  }

  if (!response.ok) {
    return;
  }

  try {
    const result = validatedDraftSchema.safeParse(await response.json());
    return result.success
      ? { kind: "next", path: result.data.path, revision }
      : undefined;
  } catch (error) {
    throw new NextDrupalPreviewValidationError(
      "Failed to read the Next.js for Drupal preview validation response",
      { cause: error }
    );
  }
}
