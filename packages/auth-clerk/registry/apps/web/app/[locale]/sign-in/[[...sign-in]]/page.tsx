import { SignIn } from "@repo/auth/components/sign-in";
import type { SupportedLocale } from "@repo/i18n/config";
import { getPathname } from "@repo/i18n/navigation";

interface SignInPageProps {
  readonly params: Promise<{ readonly locale: SupportedLocale }>;
}

const SignInPage = async ({ params }: SignInPageProps) => {
  const { locale } = await params;

  return (
    <SignIn
      fallbackRedirectUrl={getPathname({ href: "/", locale })}
      path={getPathname({ href: "/sign-in", locale })}
    />
  );
};

export default SignInPage;
