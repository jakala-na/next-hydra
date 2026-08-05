import { type NextRequest, NextResponse } from "next/server";
import {
  isNextDrupalPreviewRequest,
  NextDrupalPreviewValidationError,
  validateNextDrupalPreview,
} from "../lib/next-preview";
import {
  DrupalPreviewValidationError,
  validateDrupalPreview,
} from "../lib/preview";
import type { DrupalPreviewContext } from "../lib/preview-context";
import { enableDrupalPreview } from "../lib/preview-session";

const BAD_GATEWAY_STATUS = 502;
const UNAUTHORIZED_STATUS = 401;

export async function GET(request: NextRequest): Promise<NextResponse> {
  const id = request.nextUrl.searchParams.get("uuid");
  const token = request.nextUrl.searchParams.get("token");

  const hasGraphqlPreview = Boolean(id && token);
  const hasNextPreview = isNextDrupalPreviewRequest(
    request.nextUrl.searchParams
  );

  if (!(hasGraphqlPreview || hasNextPreview)) {
    return NextResponse.json(
      { error: "A valid Drupal preview request is required" },
      { status: 400 }
    );
  }

  let preview: DrupalPreviewContext | undefined;
  try {
    preview =
      id && token
        ? await validateDrupalPreview(id, token)
        : await validateNextDrupalPreview(request.nextUrl.searchParams);
  } catch (error) {
    if (
      error instanceof DrupalPreviewValidationError ||
      error instanceof NextDrupalPreviewValidationError
    ) {
      return NextResponse.json(
        { error: "Drupal preview validation failed" },
        { status: BAD_GATEWAY_STATUS }
      );
    }
    throw error;
  }

  if (!preview) {
    return NextResponse.json(
      { error: "Invalid or expired Drupal preview" },
      { status: UNAUTHORIZED_STATUS }
    );
  }

  await enableDrupalPreview(preview);
  return NextResponse.redirect(new URL(preview.path, request.url));
}
