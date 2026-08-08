import "server-only";

import { withAuth } from "@repo/auth-workos/server";
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
  const session = await withAuth();

  return (
    <ArchitectureBoundary
      component="server"
      description="Reads the request-bound WorkOS session and streams the appropriate account controls into the static header."
      layer="orchestration"
      layerLabel="Authentication orchestration"
      name="AccountSession"
      rendering="streamed"
      source="app"
      sourceLabel="WorkOS authentication"
    >
      <AccountMenuClient user={toAccountMenuUser(session.user)} />
    </ArchitectureBoundary>
  );
}

export function AccountMenuSkeleton() {
  return (
    <ArchitectureBoundary
      component="server"
      description="The static header fallback shown while the WorkOS session resolves."
      layer="orchestration"
      layerLabel="Suspense stream fallback"
      name="AccountSession (pending)"
      rendering="streamed"
      source="app"
      sourceLabel="WorkOS authentication"
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
