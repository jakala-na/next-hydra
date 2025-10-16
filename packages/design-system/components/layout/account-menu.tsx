"use client";

import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@repo/auth/client";
import { Button } from "@repo/design-system/components/ui/button";
import { useTranslations } from "@repo/i18n";

export function AccountMenuClient() {
  const t = useTranslations("web.header");
  return (
    <div className="relative">
      <SignedOut>
        <SignInButton>
          <Button className="inline" variant="outline">
            {t("signIn")}
          </Button>
        </SignInButton>
        <SignUpButton>
          <Button>{t("signUp")}</Button>
        </SignUpButton>
      </SignedOut>
      <SignedIn>
        <UserButton />
      </SignedIn>
    </div>
  );
}
