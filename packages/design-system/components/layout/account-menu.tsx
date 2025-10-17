"use client";

import {
  SignedIn,
  SignedOut,
  SignInButton,
  SignUpButton,
  UserButton,
} from "@repo/auth/client";
import { Button } from "@repo/design-system/components/ui/button";
import { cn } from "@repo/design-system/lib/utils";
import { useTranslations } from "@repo/i18n";

export function AccountMenuClient({
  variant,
}: {
  variant: "mobile" | "desktop";
}) {
  const t = useTranslations("web.header");
  return (
    <div
      className={cn(
        "relative",
        variant === "mobile" ? "block md:hidden" : "hidden md:block"
      )}
    >
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
