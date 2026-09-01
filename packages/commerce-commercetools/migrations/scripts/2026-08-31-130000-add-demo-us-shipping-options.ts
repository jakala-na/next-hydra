import type {
  ByProjectKeyRequestBuilder,
  TaxCategoryResourceIdentifier,
  ZoneResourceIdentifier,
} from "@commercetools/platform-sdk";
import { Schema } from "effect";

import type { MigrationDefinition } from "../types";

const US_ZONE_KEY = "demo-us-delivery";
const SHIPPING_TAX_CATEGORY_KEY = "demo-shipping-tax";

const isNotFound = Schema.is(
  Schema.Struct({ statusCode: Schema.Literal(404) })
);

const exists = async <Value>(read: () => PromiseLike<Value>) => {
  try {
    await read();
    return true;
  } catch (error) {
    if (isNotFound(error)) {
      return false;
    }
    throw error;
  }
};

const ensureZone = async (apiRoot: ByProjectKeyRequestBuilder) => {
  const existing = await apiRoot
    .zones()
    .get({ queryArgs: { where: 'locations(country="US")' } })
    .execute();
  const countryWideZone = existing.body.results.find((zone) =>
    zone.locations.some(
      (location) => location.country === "US" && location.state === undefined
    )
  );
  if (countryWideZone !== undefined) {
    return {
      id: countryWideZone.id,
      typeId: "zone",
    } as const satisfies ZoneResourceIdentifier;
  }

  const created = await apiRoot
    .zones()
    .post({
      body: {
        key: US_ZONE_KEY,
        locations: [{ country: "US" }],
        name: "Demo US delivery",
      },
    })
    .execute();
  return {
    id: created.body.id,
    typeId: "zone",
  } as const satisfies ZoneResourceIdentifier;
};

const ensureTaxCategory = async (apiRoot: ByProjectKeyRequestBuilder) => {
  const existing = await apiRoot
    .taxCategories()
    .get({ queryArgs: { where: 'rates(country="US")' } })
    .execute();
  const countryWideCategory = existing.body.results.find((category) =>
    category.rates.some(
      (rate) => rate.country === "US" && rate.state === undefined
    )
  );
  if (countryWideCategory !== undefined) {
    return {
      id: countryWideCategory.id,
      typeId: "tax-category",
    } as const satisfies TaxCategoryResourceIdentifier;
  }

  const created = await apiRoot
    .taxCategories()
    .post({
      body: {
        key: SHIPPING_TAX_CATEGORY_KEY,
        name: "Demo shipping tax",
        rates: [
          {
            amount: 0,
            country: "US",
            includedInPrice: false,
            name: "US shipping tax",
          },
        ],
      },
    })
    .execute();
  return {
    id: created.body.id,
    typeId: "tax-category",
  } as const satisfies TaxCategoryResourceIdentifier;
};

const ensureShippingMethod = async (
  apiRoot: ByProjectKeyRequestBuilder,
  input: {
    readonly key: string;
    readonly name: string;
    readonly price: number;
    readonly taxCategory: TaxCategoryResourceIdentifier;
    readonly zone: ZoneResourceIdentifier;
  }
) => {
  if (
    await exists(
      async () =>
        await apiRoot
          .shippingMethods()
          .withKey({ key: input.key })
          .get()
          .execute()
    )
  ) {
    return;
  }

  await apiRoot
    .shippingMethods()
    .post({
      body: {
        active: true,
        isDefault: false,
        key: input.key,
        localizedName: { "en-US": input.name },
        name: input.name,
        taxCategory: input.taxCategory,
        zoneRates: [
          {
            shippingRates: [
              {
                price: { centAmount: input.price, currencyCode: "USD" },
              },
            ],
            zone: input.zone,
          },
        ],
      },
    })
    .execute();
};

export const migration: MigrationDefinition = {
  description:
    "Add deterministic US Standard and Express table-rate Shipping Methods for the demo checkout",
  name: "Add Demo US Shipping Options",
  async up(apiRoot) {
    const zone = await ensureZone(apiRoot);
    const taxCategory = await ensureTaxCategory(apiRoot);
    await ensureShippingMethod(apiRoot, {
      key: "demo-standard",
      name: "Standard",
      price: 50_000,
      taxCategory,
      zone,
    });
    await ensureShippingMethod(apiRoot, {
      key: "demo-express",
      name: "Express",
      price: 125_000,
      taxCategory,
      zone,
    });
  },
};
