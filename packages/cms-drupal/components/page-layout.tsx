import { isPageRedirect } from "@drupal-canvas/headless";
import { getDraftData } from "@drupal-canvas/headless-next";
import type { Locale } from "@repo/i18n";
import type { ReactNode } from "react";

import type { CanvasComponentProps } from "../generated/canvas-component-props";
import { getCanvasPage } from "../lib/canvas-page";
import {
  findPageShell,
  withApplicationContent,
} from "../lib/canvas-page-template";
import { toDrupalPath } from "../lib/locale";
import { CanvasComponentTree } from "./canvas-component-tree";

type Props = {
  children: ReactNode;
  header: ReactNode;
  footer: ReactNode;
  locale: Locale;
};

/** Shared native template around CMS and application routes.
 * Page editing marks only routed content; template editing marks shared slots.
 */
export async function CmsPageLayout({
  children,
  header,
  footer,
  locale,
}: Props) {
  // The published empty page exposes the shared native template through the
  // standard content API, including staged template edits during preview.
  const page = await getCanvasPage(toDrupalPath("/site-shell", locale));
  // Signed template previews return the edited variant, which may have no shell.
  const draft = await getDraftData();
  const previewVariant = draft?.previewContext?.pageVariant;
  if (
    !page ||
    isPageRedirect(page) ||
    !page.content ||
    (!previewVariant && !findPageShell(page.content))
  ) {
    throw new Error(
      "The Canvas site page template is missing. Install the base recipe."
    );
  }
  function SiteShell({
    preHeader,
    postHeader,
    content,
    preFooter,
    postFooter,
  }: CanvasComponentProps<"site-shell">) {
    return (
      <>
        {preHeader}
        {header}
        {postHeader}
        {content}
        {preFooter}
        {footer}
        {postFooter}
      </>
    );
  }
  return (
    <CanvasComponentTree
      tree={
        previewVariant
          ? page.content
          : withApplicationContent({
              ...page.content,
              canvasDraftMode: undefined,
            })
      }
      components={{
        "application-content": (): ReactNode => children,
        "site-shell": SiteShell,
      }}
    />
  );
}
