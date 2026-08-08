"use client";

import { signOutAction } from "@repo/auth-workos/actions";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import {
  AccountMenu,
  type AccountMenuUser,
} from "@repo/design-system/components/layout/account-menu";
import { useTranslations } from "@repo/i18n";

type AccountMenuClientProps = {
  readonly user: AccountMenuUser | null;
};

export function AccountMenuClient({ user }: AccountMenuClientProps) {
  const t = useTranslations("web.header");

  return (
    <ArchitectureBoundary
      component="client"
      description="Hydrates the account menu interactions after the server resolves the WorkOS session."
      layer="interactive"
      layerLabel="Interactive account controls"
      name="AccountMenu"
      rendering="streamed"
      source="app"
      sourceLabel="Next.js application"
    >
      <AccountMenu
        labels={{
          signIn: t("signIn"),
          signOut: t("signOut"),
          signUp: t("signUp"),
          user: t("user"),
        }}
        signOutAction={signOutAction}
        user={user}
      />
    </ArchitectureBoundary>
  );
}
