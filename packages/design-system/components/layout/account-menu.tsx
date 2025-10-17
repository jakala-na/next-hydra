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
    <div className="flex items-center gap-3 text-xs sm:text-sm">
      <SignedOut>
        <div className="flex items-center gap-2">
          <SignInButton>
            <Button
              variant="link"
              size="sm"
              className="px-0 text-[inherit] hover:text-[inherit] hover:underline"
            >
              {t("signIn")}
            </Button>
          </SignInButton>
          <span aria-hidden="true" className="hidden sm:inline">
            /
          </span>
          <SignUpButton>
            <Button
              variant="link"
              size="sm"
              className="px-0 text-[inherit] hover:text-[inherit] hover:underline"
            >
              {t("signUp")}
            </Button>
          </SignUpButton>
        </div>
      </SignedOut>
      <SignedIn>
        <div className="flex items-center">
          <UserButton />
        </div>
      </SignedIn>
    </div>
  );
}
