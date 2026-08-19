"use client";

import { useLocale, useTranslations } from "@repo/i18n";
import type { ReactElement } from "react";

import CanvasArticleCard from ".";
import type { CanvasArticleCardProps } from ".";

export default function CanvasArticleCardNextAdapter(
  props: CanvasArticleCardProps
): ReactElement {
  const locale = useLocale();
  const t = useTranslations("web.article");

  return (
    <CanvasArticleCard
      {...props}
      locale={locale}
      readMoreLabel={t("readGuide")}
    />
  );
}
