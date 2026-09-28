"use client";

import { useLocale } from "@repo/i18n";

import CanvasArticle from ".";
import type { CanvasComponentProps } from "../../generated/canvas-component-props";

export default function CanvasArticleNextAdapter(
  props: CanvasComponentProps<"article">
) {
  return <CanvasArticle {...props} locale={useLocale()} />;
}
