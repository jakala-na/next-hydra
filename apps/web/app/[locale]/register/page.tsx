import { getTranslations, hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { RegistrationForm } from "@repo/registration-effect/components/registration-form";
import { notFound } from "next/navigation";
import { submitRegistrationEffect } from "@/lib/registration-effect-actions";

export default async function RegisterPage({
  params,
}: PageProps<"/[locale]/register">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);
  const t = await getTranslations({
    locale,
    namespace: "web.registration.page",
  });

  return (
    <main className="min-h-[calc(100vh-10rem)] bg-[radial-gradient(circle_at_top,_rgba(120,113,108,0.12),_transparent_55%),linear-gradient(180deg,_#fafaf9,_#f5f5f4)] px-6 py-16">
      <div className="mx-auto max-w-4xl">
        <div className="mb-10 space-y-4">
          <p className="text-sm text-stone-500 uppercase tracking-[0.24em]">
            {t("eyebrow")}
          </p>
          <h1 className="max-w-2xl text-balance font-semibold text-4xl text-stone-950">
            {t("title")}
          </h1>
          <p className="max-w-2xl text-lg text-stone-600 leading-8">
            {t("description")}
          </p>
        </div>

        <RegistrationForm
          submit={submitRegistrationEffect.bind(
            null,
            `/${locale}/register/awaiting-approval`
          )}
        />
      </div>
    </main>
  );
}
