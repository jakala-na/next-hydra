"use client";

import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import { AccountMenu } from "@repo/design-system/components/layout/account-menu";
import type { AccountMenuUser } from "@repo/design-system/components/layout/account-menu";
import { useTranslations } from "@repo/i18n";

import { accountLinks } from "./account-links";

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
        {...accountLinks()}
        labels={{
          account: t("account"),
          signIn: t("signIn"),
          signOut: t("signOut"),
          signUp: t("signUp"),
          user: t("user"),
        }}
        signInHref={signInHref}
        signOutHref={signOutHref}
        user={user}
      />
    </ArchitectureBoundary>
  );
}
