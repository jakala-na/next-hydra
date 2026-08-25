import type { NextRequest } from "next/server";

export function cmsProxy(_request: NextRequest): undefined {
  // Drupal preview sessions are established by the validated draft route.
}
