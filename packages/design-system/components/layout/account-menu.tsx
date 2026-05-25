"use client";

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
import { LogOut } from "lucide-react";
import type { Route } from "next";
import Link from "next/link";

export type AccountMenuUser = {
  readonly email?: string | null;
  readonly firstName?: string | null;
  readonly lastName?: string | null;
  readonly profilePictureUrl?: string | null;
};

export type AccountMenuLabels = {
  readonly user: string;
  readonly signIn: string;
  readonly signOut: string;
  readonly signUp: string;
};

export type AccountMenuProps = {
  readonly labels: AccountMenuLabels;
  readonly loading?: boolean;
  readonly signInHref?: string;
  readonly signOutAction?: (formData: FormData) => void | Promise<void>;
  readonly signUpHref?: string;
  readonly user?: AccountMenuUser | null;
};

// Use prefetch=false to avoid RSC fetch issues when redirecting to external auth
function AuthLink({
  children,
  href,
}: {
  readonly children: React.ReactNode;
  readonly href: string;
}) {
  return (
    <Link
      href={href as Route}
      prefetch={false}
      style={{ textDecoration: "none" }}
    >
      {children}
    </Link>
  );
}

function UserButton({
  labels,
  signOutAction,
  user,
}: {
  readonly labels: AccountMenuLabels;
  readonly signOutAction?: (formData: FormData) => void | Promise<void>;
  readonly user: AccountMenuUser;
}) {
  const displayName =
    user.firstName && user.lastName
      ? `${user.firstName} ${user.lastName}`
      : user.email || labels.user;
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
            <span>{labels.signOut}</span>
          </button>
        </form>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AccountMenu({
  labels,
  loading,
  signInHref = "/api/auth/signin",
  signOutAction,
  signUpHref = "/api/auth/signup",
  user,
}: AccountMenuProps) {
  if (loading) {
    return null;
  }

  return (
    <div className="flex items-center gap-3 text-xs sm:text-sm">
      {user ? (
        <div className="flex items-center">
          <UserButton
            labels={labels}
            signOutAction={signOutAction}
            user={user}
          />
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <AuthLink href={signInHref}>
            <Button
              variant="link"
              size="sm"
              className="px-0 text-[inherit] hover:text-[inherit] hover:underline"
            >
              {labels.signIn}
            </Button>
          </AuthLink>
          <span aria-hidden="true" className="hidden sm:inline">
            /
          </span>
          <AuthLink href={signUpHref}>
            <Button
              variant="link"
              size="sm"
              className="px-0 text-[inherit] hover:text-[inherit] hover:underline"
            >
              {labels.signUp}
            </Button>
          </AuthLink>
        </div>
      )}
    </div>
  );
}
