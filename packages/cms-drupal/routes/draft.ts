import { type NextRequest, NextResponse } from "next/server";
import { type DrupalLangcode, isDrupalLangcode } from "../lib/locale";
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
  const requestedLangcode = request.nextUrl.searchParams.get("langcode");

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

  let langcode: DrupalLangcode = "en";
  if (requestedLangcode) {
    if (!isDrupalLangcode(requestedLangcode)) {
      return NextResponse.json(
        { error: "Unsupported Drupal preview language" },
        { status: 400 }
      );
    }
    langcode = requestedLangcode;
  }

  let preview: DrupalPreviewContext | undefined;
  try {
    preview =
      id && token
        ? await validateDrupalPreview(id, token, langcode)
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
