import type {
  AssociateRole,
  AssociateRoleUpdate,
  ByProjectKeyRequestBuilder,
  Permission,
} from "@commercetools/platform-sdk";
import { describe, expect, it, vi } from "vitest";
import { migration } from "./scripts/2026-07-31-120000-ensure-address-book-associate-role-permissions";

const OWNER_ROLE_VERSION = 4;
const ASSOCIATE_ROLE_VERSION = 7;

const associateRole = (
  key: "owner" | "associate",
  version: number,
  permissions: Permission[]
) =>
  ({
    id: `${key}-role-id`,
    key,
    version,
    permissions,
    buyerAssignable: false,
  }) as unknown as AssociateRole;

const apiRootForAssociateRoles = (
  roles: Readonly<Record<"owner" | "associate", AssociateRole>>
) => {
  const updates: Array<{
    readonly key: string;
    readonly body: AssociateRoleUpdate;
  }> = [];
  const get = vi.fn((key: "owner" | "associate") => () => ({
    execute: vi.fn().mockResolvedValue({ body: roles[key] }),
  }));
  const post = vi.fn(
    (key: "owner" | "associate") =>
      (request: { readonly body: AssociateRoleUpdate }) => {
        updates.push({ key, body: request.body });
        return { execute: vi.fn().mockResolvedValue({}) };
      }
  );
  const withKey = vi.fn(({ key }: { readonly key: string }) => ({
    get: get(key as "owner" | "associate"),
    post: post(key as "owner" | "associate"),
  }));
  const apiRoot = {
    associateRoles: () => ({ withKey }),
  } as unknown as ByProjectKeyRequestBuilder;

  return { apiRoot, updates };
};

describe("Address Book Associate Role permission migration", () => {
  it("adds UpdateBusinessUnitDetails without replacing existing permissions", async () => {
    const { apiRoot, updates } = apiRootForAssociateRoles({
      owner: associateRole("owner", OWNER_ROLE_VERSION, [
        "CreateMyCarts",
        "UpdateOthersCarts",
      ]),
      associate: associateRole("associate", ASSOCIATE_ROLE_VERSION, [
        "CreateMyCarts",
        "UpdateMyCarts",
      ]),
    });

    await migration.up(apiRoot);

    expect(updates).toEqual([
      {
        key: "owner",
        body: {
          version: OWNER_ROLE_VERSION,
          actions: [
            {
              action: "addPermission",
              permission: "UpdateBusinessUnitDetails",
            },
          ],
        },
      },
      {
        key: "associate",
        body: {
          version: ASSOCIATE_ROLE_VERSION,
          actions: [
            {
              action: "addPermission",
              permission: "UpdateBusinessUnitDetails",
            },
          ],
        },
      },
    ]);
  });

  it("does not update roles that already have the permission", async () => {
    const { apiRoot, updates } = apiRootForAssociateRoles({
      owner: associateRole("owner", OWNER_ROLE_VERSION, [
        "UpdateBusinessUnitDetails",
      ]),
      associate: associateRole("associate", ASSOCIATE_ROLE_VERSION, [
        "CreateMyCarts",
        "UpdateBusinessUnitDetails",
      ]),
    });

    await migration.up(apiRoot);

    expect(updates).toEqual([]);
  });
});
