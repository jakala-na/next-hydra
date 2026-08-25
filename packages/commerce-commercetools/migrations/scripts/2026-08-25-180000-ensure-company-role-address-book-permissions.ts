import type {
  ByProjectKeyRequestBuilder,
  Permission,
} from "@commercetools/platform-sdk";

import type { MigrationDefinition } from "../types";

const ADDRESS_BOOK_PERMISSION: Permission = "UpdateBusinessUnitDetails";
type CompanyRoleKey = "admin" | "approver" | "buyer";

const ensureAddressBookPermission = async (
  apiRoot: ByProjectKeyRequestBuilder,
  roleKey: CompanyRoleKey
) => {
  const roleRequest = apiRoot.associateRoles().withKey({ key: roleKey });
  const response = await roleRequest.get().execute();
  const role = response.body;

  if (role.permissions.includes(ADDRESS_BOOK_PERMISSION)) {
    return;
  }

  await roleRequest
    .post({
      body: {
        actions: [
          {
            action: "addPermission",
            permission: ADDRESS_BOOK_PERMISSION,
          },
        ],
        version: role.version,
      },
    })
    .execute();
};

export const migration: MigrationDefinition = {
  description:
    "Allow company administrators, buyers, and approvers to update Business Unit addresses without replacing their existing permissions",
  name: "Enable Company Role Address Books",
  async up(apiRoot) {
    await Promise.all([
      ensureAddressBookPermission(apiRoot, "admin"),
      ensureAddressBookPermission(apiRoot, "buyer"),
      ensureAddressBookPermission(apiRoot, "approver"),
    ]);
  },
};
