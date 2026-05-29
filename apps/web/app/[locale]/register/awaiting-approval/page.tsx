import { getTranslations, hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { notFound } from "next/navigation";

export default async function AwaitingApprovalPage({
  params,
}: PageProps<"/[locale]/register/awaiting-approval">) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }
  setRequestLocale(locale);

  const t = await getTranslations({
    locale,
    namespace: "web.registration.awaiting",
  });

  return (
    <main className="flex min-h-[calc(100vh-10rem)] items-center justify-center bg-stone-100 px-6 py-16">
      <div className="max-w-xl rounded-[2rem] border border-stone-300 bg-white p-10 text-center shadow-sm">
        <p className="text-sm text-stone-500 uppercase tracking-[0.24em]">
          {t("eyebrow")}
        </p>
        <h1 className="mt-4 font-semibold text-4xl text-stone-950">
          {t("title")}
        </h1>
        <p className="mt-6 text-base text-stone-600 leading-7">
          {t("description")}
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
