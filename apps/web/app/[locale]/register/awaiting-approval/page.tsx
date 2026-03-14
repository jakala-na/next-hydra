import { getTranslations } from "@repo/i18n";
import type { Locale } from "@repo/i18n/types";

type AwaitingApprovalPageProps = {
  readonly params: Promise<{
    locale: Locale;
  }>;
  readonly searchParams: Promise<{
    email?: string;
  }>;
};

export default async function AwaitingApprovalPage({
  params,
  searchParams,
}: AwaitingApprovalPageProps) {
  const { locale } = await params;
  const { email } = await searchParams;
  const t = await getTranslations({
    locale,
    namespace: "web.registration.awaiting",
  });

  return (
    <main className="flex min-h-[calc(100vh-10rem)] items-center justify-center bg-stone-100 px-6 py-16">
      <div className="max-w-xl rounded-[2rem] border border-stone-300 bg-white p-10 text-center shadow-sm">
        <p className="text-sm uppercase tracking-[0.24em] text-stone-500">
          {t("eyebrow")}
        </p>
        <h1 className="mt-4 font-semibold text-4xl text-stone-950">
          {t("title")}
        </h1>
        <p className="mt-6 text-base leading-7 text-stone-600">
          {typeof email === "string"
            ? t("descriptionWithEmail", { email })
            : t("description")}
        </p>
        <div className="mt-8 flex justify-center gap-4">
          <a className="text-sm text-stone-900 underline" href="/">
            {t("backToSite")}
          </a>
        </div>
      </div>
    </main>
  );
}
