import { migrationClient } from "../migration-client";
import type { MigrationDefinition } from "../types";

export const migration: MigrationDefinition = {
  name: "Create Order Custom Fields Type",
  description:
    "Create the shared Cart and Order custom type with checkout contact details",
  async up(apiRoot) {
    const builder = await migrationClient(apiRoot)
      .ensureType("orderCustomFields", {
        name: { "en-US": "Order Custom Fields" },
        description: {
          "en-US": "Custom fields persisted on a Cart and copied to its Order",
        },
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
