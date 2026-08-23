import "server-only";
import { getAuthRoutes, withAuth } from "@repo/auth/server";
import { ArchitectureBoundary } from "@repo/design-system/components/architecture/architecture-boundary";
import type { AccountMenuUser } from "@repo/design-system/components/layout/account-menu";
import { connection } from "next/server";

import { AccountMenuClient } from "./account-menu-client";

const toAccountMenuUser = (
  user: Awaited<ReturnType<typeof withAuth>>["user"]
): AccountMenuUser | null =>
  user
    ? {
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        profilePictureUrl: user.profilePictureUrl,
      }
    : null;

export async function AccountMenu() {
  await connection();
  const [routes, session] = await Promise.all([getAuthRoutes(), withAuth()]);

  return (
    <ArchitectureBoundary
      component="server"
      description="Reads the request-bound auth session and streams provider-owned account routes into the static header."
      layer="orchestration"
      layerLabel="Authentication orchestration"
      name="AccountSession"
      rendering="streamed"
      source="app"
      sourceLabel="Authentication provider"
    >
      <AccountMenuClient
        signInHref={routes.signInHref}
        signOutHref={routes.signOutHref}
        {...(routes.signUpHref === undefined
          ? {}
          : { signUpHref: routes.signUpHref })}
        user={toAccountMenuUser(session.user)}
      />
    </ArchitectureBoundary>
  );
}

export function AccountMenuSkeleton() {
  return (
    <ArchitectureBoundary
      component="server"
      description="The static header fallback shown while the authentication session resolves."
      layer="orchestration"
      layerLabel="Suspense stream fallback"
      name="AccountSession (pending)"
      rendering="streamed"
      source="app"
      sourceLabel="Authentication provider"
    >
      <div
        aria-label="Loading account controls"
        className="flex h-8 items-center gap-2"
        role="status"
      >
        <span className="h-4 w-12 animate-pulse rounded bg-accent-foreground/15" />
        <span aria-hidden="true" className="hidden sm:inline">
          /
        </span>
        <span className="h-4 w-14 animate-pulse rounded bg-accent-foreground/15" />
      </div>
    </ArchitectureBoundary>
  );
}
