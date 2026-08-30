import { SignUp } from "@repo/auth/components/sign-up";
import type { SupportedLocale } from "@repo/i18n/config";
import { getPathname } from "@repo/i18n/navigation";

interface AcceptInvitationPageProps {
  readonly params: Promise<{ readonly locale: SupportedLocale }>;
}

const AcceptInvitationPage = async ({ params }: AcceptInvitationPageProps) => {
  const { locale } = await params;

  return (
    <SignUp
      fallbackRedirectUrl={getPathname({ href: "/", locale })}
      path={getPathname({ href: "/accept-invitation", locale })}
    />
  );
};

export default AcceptInvitationPage;
