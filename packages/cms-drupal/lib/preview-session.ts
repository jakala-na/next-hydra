import "server-only";

import { cookies, draftMode } from "next/headers";
import {
  DRUPAL_PREVIEW_COOKIE,
  DRUPAL_PREVIEW_COOKIE_OPTIONS,
  type DrupalPreviewContext,
  decodeDrupalPreviewContext,
  encodeDrupalPreviewContext,
} from "./preview-context";

const NEXT_DRAFT_MODE_COOKIE = "__prerender_bypass";

async function setIframeCompatibleDraftCookie(): Promise<void> {
  const cookieStore = await cookies();
  const draftCookie = cookieStore.get(NEXT_DRAFT_MODE_COOKIE);
  if (!draftCookie) {
    return;
  }

  cookieStore.set({
    httpOnly: true,
    name: NEXT_DRAFT_MODE_COOKIE,
    path: "/",
    sameSite: "none",
    secure: true,
    value: draftCookie.value,
  });
}

export async function enableDrupalPreview(
  context: DrupalPreviewContext
): Promise<void> {
  (await draftMode()).enable();
  await setIframeCompatibleDraftCookie();
  (await cookies()).set({
    ...DRUPAL_PREVIEW_COOKIE_OPTIONS,
    name: DRUPAL_PREVIEW_COOKIE,
    value: encodeDrupalPreviewContext(context),
  });
}

export async function getDrupalPreviewContext(): Promise<
  DrupalPreviewContext | undefined
> {
  const value = (await cookies()).get(DRUPAL_PREVIEW_COOKIE)?.value;
  return decodeDrupalPreviewContext(value);
}

export async function disableDrupalPreview(): Promise<void> {
  (await draftMode()).disable();
  const cookieStore = await cookies();
  const expiredCookie = {
    expires: new Date(0),
    httpOnly: true,
    path: "/",
    sameSite: "none" as const,
    secure: true,
    value: "",
  };

  cookieStore.set({
    ...expiredCookie,
    name: NEXT_DRAFT_MODE_COOKIE,
  });
  cookieStore.set({
    ...expiredCookie,
    name: DRUPAL_PREVIEW_COOKIE,
  });
}
