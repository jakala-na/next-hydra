/* oxlint-disable anti-slop/no-chained-type-assertions, anti-slop/require-safety-comment-for-type-assertion, typescript/no-unsafe-type-assertion, vitest/require-mock-type-parameters -- The Commercetools fluent SDK exposes a very broad generated builder; this test double intentionally implements only the role request surface exercised by the migration. */
import type {
  AssociateRole,
  AssociateRoleUpdate,
  ByProjectKeyRequestBuilder,
  Permission,
} from "@commercetools/platform-sdk";
import { describe, expect, it, vi } from "vitest";

import { migration } from "./scripts/2026-08-25-180000-ensure-company-role-address-book-permissions";

const ADMIN_ROLE_VERSION = 4;
const APPROVER_ROLE_VERSION = 5;
const BUYER_ROLE_VERSION = 7;
type RoleKey = "admin" | "approver" | "buyer";

const associateRole = (
  key: RoleKey,
  version: number,
  permissions: Permission[]
) =>
  ({
    buyerAssignable: false,
    id: `${key}-role-id`,
    key,
    permissions,
    version,
  }) as unknown as AssociateRole;

const apiRootForAssociateRoles = (
  roles: Readonly<Record<RoleKey, AssociateRole>>
) => {
  const updates: {
    readonly key: string;
    readonly body: AssociateRoleUpdate;
  }[] = [];
  const get = vi.fn((key: RoleKey) => () => ({
    execute: vi.fn().mockResolvedValue({ body: roles[key] }),
  }));
  const post = vi.fn(
    (key: RoleKey) => (request: { readonly body: AssociateRoleUpdate }) => {
      updates.push({ body: request.body, key });
      return { execute: vi.fn().mockResolvedValue({}) };
    }
  );
  const withKey = vi.fn(({ key }: { readonly key: string }) => ({
    get: get(key as RoleKey),
    post: post(key as RoleKey),
  }));
  const apiRoot = {
    associateRoles: () => ({ withKey }),
  } as unknown as ByProjectKeyRequestBuilder;

  return { apiRoot, updates };
};

describe("Company Role Address Book permission migration", () => {
  it("adds UpdateBusinessUnitDetails without replacing existing permissions", async () => {
    const { apiRoot, updates } = apiRootForAssociateRoles({
      admin: associateRole("admin", ADMIN_ROLE_VERSION, [
        "CreateMyCarts",
        "UpdateOthersCarts",
      ]),
      approver: associateRole("approver", APPROVER_ROLE_VERSION, [
        "ViewOthersOrders",
      ]),
      buyer: associateRole("buyer", BUYER_ROLE_VERSION, [
        "CreateMyCarts",
        "UpdateMyCarts",
      ]),
    });

    await migration.up(apiRoot);

    expect(updates).toStrictEqual([
      {
        body: {
          actions: [
            {
              action: "addPermission",
              permission: "UpdateBusinessUnitDetails",
            },
          ],
          version: ADMIN_ROLE_VERSION,
        },
        key: "admin",
      },
      {
        body: {
          actions: [
            {
              action: "addPermission",
              permission: "UpdateBusinessUnitDetails",
            },
          ],
          version: BUYER_ROLE_VERSION,
        },
        key: "buyer",
      },
      {
        body: {
          actions: [
            {
              action: "addPermission",
              permission: "UpdateBusinessUnitDetails",
            },
          ],
          version: APPROVER_ROLE_VERSION,
        },
        key: "approver",
      },
    ]);
  });

  it("does not update roles that already have the permission", async () => {
    const { apiRoot, updates } = apiRootForAssociateRoles({
      admin: associateRole("admin", ADMIN_ROLE_VERSION, [
        "UpdateBusinessUnitDetails",
      ]),
      approver: associateRole("approver", APPROVER_ROLE_VERSION, [
        "UpdateBusinessUnitDetails",
      ]),
      buyer: associateRole("buyer", BUYER_ROLE_VERSION, [
        "CreateMyCarts",
        "UpdateBusinessUnitDetails",
      ]),
    });

    await migration.up(apiRoot);

    expect(updates).toStrictEqual([]);
  });
});
