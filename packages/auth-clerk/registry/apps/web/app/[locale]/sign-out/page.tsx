import { SignOut } from "@repo/auth/components/sign-out";
import type { SupportedLocale } from "@repo/i18n/config";
import { getPathname } from "@repo/i18n/navigation";

interface SignOutPageProps {
  readonly params: Promise<{ readonly locale: SupportedLocale }>;
}

const SignOutPage = async ({ params }: SignOutPageProps) => {
  const { locale } = await params;

  return <SignOut redirectUrl={getPathname({ href: "/", locale })} />;
};

export default SignOutPage;
