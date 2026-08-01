"use client";

import { useTranslations } from "@repo/i18n";
import { captureException } from "@sentry/nextjs";
import { useEffect } from "react";

export default function CheckoutError({
  error,
  reset,
}: {
  readonly error: Error & { readonly digest?: string };
  readonly reset: () => void;
}) {
  const t = useTranslations("web.checkout");

  useEffect(() => {
    captureException(error);
  }, [error]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-12">
      <section
        className="grid justify-items-start gap-4 rounded-md border border-destructive/40 bg-destructive/10 p-6"
        role="alert"
      >
        <h1 className="font-semibold text-xl">{t("errors.internal")}</h1>
        <button
          className="h-10 rounded-md bg-primary px-4 font-medium text-primary-foreground text-sm"
          onClick={reset}
          type="button"
        >
          {t("errorBoundary.tryAgain")}
        </button>
      </section>
    </main>
  );
}
