"use client";

import { Button } from "@repo/design-system/components/ui/button";
import { useTranslations } from "@repo/i18n";

interface CartPageErrorProps {
  readonly onRetry: () => void;
}

export function CartPageError({ onRetry }: CartPageErrorProps) {
  const t = useTranslations("web.cart.error");

  return (
    <main
      className="container mx-auto flex min-h-[60vh] max-w-4xl items-center justify-center px-4 py-16 sm:px-6"
      data-cart-page-error=""
    >
      <section
        className="grid max-w-lg justify-items-start gap-4 rounded-md border border-destructive/40 bg-destructive/10 p-6"
        role="alert"
      >
        <h1 className="font-semibold text-2xl">{t("heading")}</h1>
        <p className="text-muted-foreground">{t("description")}</p>
        <Button onClick={onRetry}>{t("actions.tryAgain")}</Button>
      </section>
    </main>
  );
}
