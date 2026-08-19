import type {
  ByProjectKeyRequestBuilder,
  Permission,
} from "@commercetools/platform-sdk";

import type { MigrationDefinition } from "../types";

const ADDRESS_BOOK_PERMISSION: Permission = "UpdateBusinessUnitDetails";
const ADDRESS_BOOK_ROLE_KEYS = ["owner", "associate"] as const;

const ensureAddressBookPermission = async (
  apiRoot: ByProjectKeyRequestBuilder,
  roleKey: (typeof ADDRESS_BOOK_ROLE_KEYS)[number]
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
    "Allow owner and associate buyers to update Business Unit addresses without replacing their existing permissions",
  name: "Enable Business Unit Address Books",
  async up(apiRoot) {
    for (const roleKey of ADDRESS_BOOK_ROLE_KEYS) {
      await ensureAddressBookPermission(apiRoot, roleKey);
    }
  },
};
