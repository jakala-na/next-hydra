import { RegistrationForm } from "@repo/auth-workos/components/registration-form";
import { getTranslations } from "@repo/i18n";
import type { Locale } from "@repo/i18n/types";
import { env } from "@/env";

const localizePath = (locale: string, path: string) =>
  locale === "en-US" ? path : `/${locale}${path}`;

type RegisterPageProps = {
  readonly params: Promise<{
    locale: Locale;
  }>;
};

export default async function RegisterPage({ params }: RegisterPageProps) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "web.registration.page" });

  return (
    <main className="min-h-[calc(100vh-10rem)] bg-[radial-gradient(circle_at_top,_rgba(120,113,108,0.12),_transparent_55%),linear-gradient(180deg,_#fafaf9,_#f5f5f4)] px-6 py-16">
      <div className="mx-auto max-w-4xl">
        <div className="mb-10 space-y-4">
          <p className="text-sm uppercase tracking-[0.24em] text-stone-500">
            {t("eyebrow")}
          </p>
          <h1 className="max-w-2xl text-balance font-semibold text-4xl text-stone-950">
            {t("title")}
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-stone-600">
            {t("description")}
          </p>
        </div>

        <RegistrationForm
          apiBaseUrl={env.NEXT_PUBLIC_API_URL ?? "http://localhost:3002"}
          awaitingApprovalUrl={localizePath(
            locale,
            "/register/awaiting-approval"
          )}
        />
      </div>
    </main>
  );
}
