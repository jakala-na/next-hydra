# Product Catalog domain language and model

Type: grilling
Status: resolved
Blocked by: 01, 02

## Question

Define the provider-agnostic Product Catalog language and schema-backed models consumed by storefront discovery, product detail, Cart inputs, and presentation code.

Resolve the exact meanings and relationships of Product, purchasable Variant, effective Variant Attributes, product-level versus variant-level source attributes, Product Summary or Card projection, Product Details projection, Category, Price, Availability, image, SEO data, options, SKU, slug, and provider identity. Decide which projections are genuine commerce-domain read models versus UI DTOs, which values must be branded, and which current Commercetools fields must disappear behind provider decoding.

Use concrete current call sites and preservation scenarios. Do not mirror the Commercetools Product Projection GraphQL schema, and do not invent extension buckets for provider data that no current consumer needs.

## Confirmed decisions

- Keep the concrete read-model names `ProductCard` and `ProductDetail`; do not replace them with a generic `ProductSummary`, and remove the `DTO` suffix. They are schema-backed commerce models shaped for the catalog discovery and product-detail use cases, while design-system props remain separate presentation types.
- `Product` is the underlying catalog concept represented by those projections. Do not introduce one catch-all Product schema with optional card/detail fields merely to have a single exported model.
- `ProductDetail` contains a non-empty collection of purchasable Product Variants and an explicit `defaultVariantId` that must identify one of them. The Commercetools Layer preserves current behavior by selecting the first Store-eligible variant after catalog filtering. Remove `masterVariant`; it currently duplicates `variants[0]` and does not reliably represent the Commercetools master variant after filtering.
- Product Attributes live only on Product Variants as effective, localized values. A provider may source them from Product-level or Variant-level storage, but that origin is discarded. Remove the duplicated top-level `ProductDetail.attributes` and do not add a generic Product fields/custom-fields bucket.
- Replace cart-specific and product-specific money shapes with one provider-neutral `Money` schema. A Product Variant may have an optional `ProductPrice` with `regular: Money` and optional `discounted: Money`; absence remains valid for quote-only products. Product Card may expose an optional `startingPrice: Money`, initially preserving the current minimum regular Variant price behavior. Remove provider price qualifiers such as country, customer-group ID, and channel ID from the domain model.
- Product Price is already selected for the current Commerce Context. For a segmented buyer, `regular` is the selected segment-specific price and `discounted` is a discount applied to that selected price. Customer-group and other provider pricing identities remain inside the provider Layer. A use case that compares or administers prices across segments would require a separate model and Service.
- Product Variant has a required `ProductAvailability` containing `availableForSale` and optional non-negative `availableQuantity`. Both values are resolved for the current Commerce Context; core commerce does not universally derive saleability from quantity because providers may support backorders or other inventory policies. The Commercetools Layer initially preserves current behavior by summing eligible supply-channel inventory and marking positive totals available for sale.
- Product Card retains aggregate `availableForSale` because it does not carry Variants. Product Detail does not duplicate aggregate availability; presentation derives it from its non-empty Variant collection.
- Use opaque branded commerce primitives for `ProductId`, `VariantId`, `Sku`, `ProductSlug`, `CategoryId`, `CategorySlug`, and `ProductTypeKey`. The active provider may supply the underlying Product, Variant, and Category ID values, including converting numeric identifiers to branded strings, without those identities becoming provider payloads. Do not expose provider name, numeric resource version, a parallel `providerId`, or unused Product/Category keys. Display copy remains ordinary validated strings.
- The CMS's current Commercetools Category field remains provider-specific integration input and must be decoded to `CategoryId` before invoking commerce programs.
- Product Options describe the dimensions a buyer uses to select a Product Variant; Product Attributes describe the Variant's effective characteristics. `ProductOption` has a branded key, display label, and non-empty normalized key/label values. Each Product Variant carries `optionValues`, mapping every Product Option key to that Variant's value key. Remove the provider-shaped text/enum option distinction and the current split-brain behavior where options list values but presentation independently reads `attributes.model`.
- `ProductCard` contains required branded Product ID and slug, required non-empty title, optional description and featured image, optional starting price, and aggregate saleability. `ProductDetail` contains required branded Product ID and slug, required non-empty title, optional description, Categories, Product Options, a non-empty Variant collection, and the Default Product Variant ID.
- `ProductVariant` contains branded Variant ID, optional SKU, images, effective Product Attributes, its Product Option value mapping, optional Product Price, and required Product Availability. `ProductCategory` contains branded Category ID plus optional localized name and slug. `ProductImage` contains a validated image URL and optional alt text.
- Remove provider-shaped or redundant Product fields: Product/Category keys, `masterVariant`, top-level Product Attributes, top-level aggregate availability, provider `updatedAt`, and provider resource version. Remove the fabricated SEO object because it only repeats Product title/description while `searchable` is ignored; metadata derives from Product Detail until distinct SEO data actually exists. Remove currently unpopulated top-level Product Detail images; metadata and JSON-LD use the Default Product Variant image, while Product Card retains its explicit featured image.
- The provider Layer must not create empty titles, missing Product Detail slugs, or `/product/undefined` links. It decodes or omits invalid projections according to the Product Discovery failure behavior decided in ticket 07.
- Product Attributes are not an untyped or merely generic record. `@repo/commerce` owns a generated public `ProductAttributesByProductType` map, generated Effect Schemas, and their inferred TypeScript types. `ProductDetail<TKey>` carries a required Product Type key and its Product Variants use the corresponding typed attribute schema, preserving autocomplete and product-type-specific mapping.
- The provider-neutral attribute vocabulary supports resolved text, numbers, booleans, normalized enums, Money, temporal values, typed Product references, defined nested values, and readonly collections of supported values. Provider localization kinds and raw reference representations are decoded before the public model.
- Commercetools schema tooling may generate this public artifact from Commercetools Product Types, and a future provider may generate the same contract. Generated files in `@repo/commerce` contain only Effect Schemas and provider-neutral commerce types, with no Commercetools imports or terminology. Redesigning product creation and migrations to consume these Schemas is a future opportunity, not part of this extraction effort.

## Answer

### Domain language

- Product is the catalog concept that groups shared merchandising information with one or more purchasable Product Variants; the buyer always purchases a Variant.
- Product Card and Product Detail are distinct schema-backed commerce read models. They are not UI component props and do not carry a `DTO` suffix.
- Product Detail contains the Product's non-empty Store-eligible Variant collection and identifies one member by `defaultVariantId`. `masterVariant` is not a domain term.
- Product Attributes are typed effective characteristics of a Variant. Their provider Product-level or Variant-level storage origin is discarded.
- Product Options are the selection dimensions that distinguish Variants. Every Variant maps every Product Option to its own normalized option value.
- Product Price and Product Availability are already resolved for the current Commerce Context.

### Schema outline

```ts
type ProductCard = {
  readonly id: ProductId
  readonly slug: ProductSlug
  readonly title: NonEmptyString
  readonly description?: string
  readonly featuredImage?: ProductImage
  readonly startingPrice?: Money
  readonly availableForSale: boolean
}

type ProductDetail<TKey extends ProductTypeKey = ProductTypeKey> = {
  readonly id: ProductId
  readonly slug: ProductSlug
  readonly productType: TKey
  readonly title: NonEmptyString
  readonly description?: string
  readonly categories: ReadonlyArray<ProductCategory>
  readonly options: ReadonlyArray<ProductOption>
  readonly variants: NonEmptyReadonlyArray<ProductVariant<TKey>>
  readonly defaultVariantId: VariantId
}

type ProductVariant<TKey extends ProductTypeKey> = {
  readonly id: VariantId
  readonly sku?: Sku
  readonly images: ReadonlyArray<ProductImage>
  readonly attributes: ProductAttributesByProductType[TKey]
  readonly optionValues: Readonly<Record<ProductOptionKey, ProductOptionValueKey>>
  readonly price?: ProductPrice
  readonly availability: ProductAvailability
}

type ProductOption = {
  readonly key: ProductOptionKey
  readonly label: string
  readonly values: NonEmptyReadonlyArray<ProductOptionValue>
}

type ProductOptionValue = {
  readonly key: ProductOptionValueKey
  readonly label: string
}

type ProductPrice = {
  readonly regular: Money
  readonly discounted?: Money
}

type ProductAvailability = {
  readonly availableForSale: boolean
  readonly availableQuantity?: NonNegativeInt
}

type ProductCategory = {
  readonly id: CategoryId
  readonly name?: string
  readonly slug?: CategorySlug
}

type ProductImage = {
  readonly url: ValidImageUrl
  readonly altText?: string
}
```

`Money` is a shared commerce schema used by Product and Cart. Product, Variant, SKU, Product slug, Category, Product Type, Product Option, and Product Option Value identities are opaque branded primitives. Provider resource versions and parallel provider identities are excluded.

### Typed Product Attributes

- `@repo/commerce` owns the generated Effect Schemas, `ProductAttributesByProductType`, `ProductTypeKey`, and inferred public TypeScript types.
- Product Detail is a generated runtime-discriminated schema keyed by `productType`, so narrowing a Product Type provides autocomplete and the correct Variant Attribute shape.
- Supported domain values cover resolved text, number, boolean, normalized enum, Money, temporal values, typed Product references, explicitly defined nested values, and readonly collections.
- Commercetools-localized text and enums become resolved domain text and enum values. Provider reference objects become branded domain identities.
- Provider tooling may generate the provider-neutral artifact, but the artifact contains no provider SDK types, attribute-kind terminology, imports, or payload shapes.
- Product creation and migration inputs may reuse these Schemas in a future effort; redesigning those workflows is out of scope here.

### Projection rules

- Product Card has aggregate saleability because it does not include Variants. Its optional starting price initially preserves the current minimum regular eligible-Variant price.
- Product Detail does not duplicate Variant Attributes, aggregate availability, or a default Variant object. Its `defaultVariantId` must identify a member of `variants`; Commercetools initially chooses the first eligible Variant after Product Selection filtering.
- Product Price contains the price selected for the current Store and buyer segment. Provider channel, country, and customer-group selection inputs remain internal.
- Product Availability is provider-resolved. Commercetools initially sums eligible supply-channel quantities and considers a positive total saleable, but core commerce does not impose that rule on other providers.
- Product Detail metadata uses title and description directly; JSON-LD and default media use the Default Product Variant. Do not fabricate a duplicate SEO object until distinct SEO data exists.

### Provider decoding and removed leakage

- The provider Layer maps its Product, Variant, and Category IDs into branded opaque commerce identities and converts numeric Variant IDs to strings.
- CMS provider Category data is decoded to `CategoryId` before it reaches Product Discovery.
- Required localized Product Card and Product Detail titles/slugs are validated instead of becoming empty strings or undefined links. Ticket 07 defines whether malformed provider projections fail the operation or are omitted from a collection.
- Remove Product/Category keys that have no consumer, Product Projection versions and timestamps, raw attributes, GraphQL fragments, price selection qualifiers, channel inventory records, Product Selection rules, `masterVariant`, top-level Product Detail Attributes, top-level Product Detail availability, unpopulated top-level Product Detail images, and the current fabricated SEO object from the public model.

### Preservation scenarios

- A category collection still returns Store-eligible Product Cards, honors limit and excluded Product ID, and produces the same link/title/description/featured-image behavior.
- A Product Detail lookup by localized slug still returns only Store-eligible Variants, uses the first eligible Variant as the initial selection, displays its option label and image, and supplies Product ID plus Variant ID to Add to Cart.
- Quote-only Variants may omit Product Price. Availability quantity may be absent even when the provider can determine saleability.
- Segment-specific and discounted prices are resolved before the Product model is returned; buyer-specific results must not be stored in a locale-only cache.
