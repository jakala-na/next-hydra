import { CustomerAccountPage } from "@repo/commerce/customer-account";
import { hasLocale, setRequestLocale } from "@repo/i18n";
import { routing } from "@repo/i18n/routing";
import { notFound } from "next/navigation";

interface AccountRouteProps {
  readonly params: Promise<{
    readonly locale: string;
  }>;
}

const Account = async ({ params }: AccountRouteProps) => {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) {
    notFound();
  }

  // oxlint-disable-next-line typescript/no-deprecated -- Match the workspace's current next-intl static locale route contract until its root-params migration.
  setRequestLocale(locale);
  return <CustomerAccountPage locale={locale} />;
};

export default Account;
