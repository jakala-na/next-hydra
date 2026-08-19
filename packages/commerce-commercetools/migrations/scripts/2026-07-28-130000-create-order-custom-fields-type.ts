import { migrationClient } from "../migration-client";
import type { MigrationDefinition } from "../types";

export const migration: MigrationDefinition = {
  description:
    "Create the shared Cart and Order custom type with checkout contact details",
  name: "Create Order Custom Fields Type",
  async up(apiRoot) {
    const builder = await migrationClient(apiRoot)
      .ensureType("orderCustomFields", {
        description: {
          "en-US": "Custom fields persisted on a Cart and copied to its Order",
        },
        name: { "en-US": "Order Custom Fields" },
        resourceTypeIds: ["order"],
      })
      .init();

    if (!builder.fieldExists("checkoutContact")) {
      builder.addStringField(
        "checkoutContact",
        { "en-US": "Checkout contact" },
        { inputHint: "MultiLine" }
      );
    }

    await builder.execute();
  },
};
