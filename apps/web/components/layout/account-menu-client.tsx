"use client";

import { signOutAction } from "@repo/auth-workos/actions";
import { useAuth } from "@repo/auth-workos/client";
import { AccountMenu } from "@repo/design-system/components/layout/account-menu";
import { useTranslations } from "@repo/i18n";

export function AccountMenuClient() {
  const { user, loading } = useAuth();
  const t = useTranslations("web.header");

  return (
    <AccountMenu
      labels={{
        user: t("user"),
        signIn: t("signIn"),
        signOut: t("signOut"),
        signUp: t("signUp"),
      }}
      loading={loading}
      signOutAction={signOutAction}
      user={user}
    />
  );
}
