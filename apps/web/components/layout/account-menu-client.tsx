"use client";

import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import { AccountMenu } from "@repo/design-system/components/layout/account-menu";
import type { AccountMenuUser } from "@repo/design-system/components/layout/account-menu";
import { useLocale, useTranslations } from "@repo/i18n";

import { accountLinks } from "./account-links";
import { localizeAuthHref } from "./auth-href";

type AccountMenuClientProps = {
  readonly signInHref: string;
  readonly signOutHref: string;
  readonly user: AccountMenuUser | null;
};

export function AccountMenuClient({
  signInHref,
  signOutHref,
  user,
}: AccountMenuClientProps) {
  const locale = useLocale();
  const t = useTranslations("web.header");

  return (
    <ArchitectureBoundary
      component="client"
      description="Hydrates the account menu interactions after the server resolves the authentication session."
      layer="interactive"
      layerLabel="Interactive account controls"
      name="AccountMenu"
      rendering="streamed"
      source="app"
      sourceLabel="Next.js application"
    >
      <AccountMenu
        {...accountLinks(locale)}
        labels={{
          account: t("account"),
          signIn: t("signIn"),
          signOut: t("signOut"),
          signUp: t("signUp"),
          user: t("user"),
        }}
        signInHref={localizeAuthHref(signInHref, locale)}
        signOutHref={localizeAuthHref(signOutHref, locale)}
        user={user}
      />
    </ArchitectureBoundary>
  );
}
