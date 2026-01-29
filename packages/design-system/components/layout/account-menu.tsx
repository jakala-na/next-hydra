"use client";

import { signOutAction } from "@repo/auth-workos/actions";
import { useAuth } from "@repo/auth-workos/client";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@repo/design-system/components/ui/avatar";
import { Button } from "@repo/design-system/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@repo/design-system/components/ui/dropdown-menu";
import { useTranslations } from "@repo/i18n";
import { LogOut } from "lucide-react";
import Link from "next/link";

type SignedInProps = {
  children: React.ReactNode;
};

function SignedIn({ children }: SignedInProps) {
  const { user, loading } = useAuth();
  if (loading || !user) {
    return null;
  }
  return <>{children}</>;
}

type SignedOutProps = {
  children: React.ReactNode;
};

function SignedOut({ children }: SignedOutProps) {
  const { user, loading } = useAuth();
  if (loading || user) {
    return null;
  }
  return <>{children}</>;
}

type SignInButtonProps = {
  children: React.ReactNode;
};

// Use prefetch=false to avoid RSC fetch issues when redirecting to external auth
function SignInButton({ children }: SignInButtonProps) {
  return (
    <Link
      href="/api/auth/signin"
      prefetch={false}
      style={{ textDecoration: "none" }}
    >
      {children}
    </Link>
  );
}

type SignUpButtonProps = {
  children: React.ReactNode;
};

// Use prefetch=false to avoid RSC fetch issues when redirecting to external auth
function SignUpButton({ children }: SignUpButtonProps) {
  return (
    <Link
      href="/api/auth/signup"
      prefetch={false}
      style={{ textDecoration: "none" }}
    >
      {children}
    </Link>
  );
}

function UserButton() {
  const { user } = useAuth();
  const t = useTranslations("web.header");

  if (!user) {
    return null;
  }

  const displayName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.email || t("user");
  const initials =
    user.firstName && user.lastName
      ? `${user.firstName[0]}${user.lastName[0]}`
      : user.email?.[0]?.toUpperCase() || "U";

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          className="relative size-8 rounded-full"
          type="button"
        >
          <Avatar className="size-8">
            {user.profilePictureUrl && (
              <AvatarImage src={user.profilePictureUrl} alt={displayName} />
            )}
            <AvatarFallback>{initials}</AvatarFallback>
          </Avatar>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col space-y-1">
            <p className="font-medium text-sm leading-none">{displayName}</p>
            {user.email && (
              <p className="text-muted-foreground text-xs leading-none">
                {user.email}
              </p>
            )}
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <form action={signOutAction}>
          <button
            type="submit"
            className="relative flex w-full cursor-pointer select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-accent-foreground"
          >
            <LogOut className="mr-2 size-4" />
            <span>{t("signOut")}</span>
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

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
