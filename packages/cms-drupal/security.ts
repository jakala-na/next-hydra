import { resolveFrameAncestors } from "@drupal-canvas/headless/server";

// withCMS sets CANVAS_SITE_URL from DRUPAL_BASE_URL when no override is supplied.
// The application owns 'self'; the provider contributes editor origins only.
export const cmsFrameAncestors: readonly string[] = resolveFrameAncestors()
  .split(/\s+/u)
  .filter((source) => source !== "'self'");
