import type { CurrencyCode, Locale } from "@repo/i18n/types";
import { Option, Schema } from "effect";
import type { FragmentOf } from "gql.tada";
import {
  CheckoutContact,
  type CheckoutDetails,
  ShippingAddress,
} from "../../domain/checkout";
import { graphql, readFragment } from "../../graphql";
import { graphqlClient } from "../client/graphql-client";
import {
  type ProductTypeKey,
  reshapeProductAttributes,
} from "../product/mappers/attributes";
import { productPriceFragment, reshapePrice } from "../product/mappers/price";
import type { Cart, LineItem } from "../types";
import { type ActionResult, domainError, Err, Ok } from "../utils/errors";
import {
  buildSaveCheckoutContactActions,
  CHECKOUT_CONTACT_CUSTOM_FIELD_NAME,
} from "./checkout-contact-actions";
import { buildSaveCheckoutDeliveryDetailsActions } from "./checkout-delivery-details-actions";
import type {
  AddToCartRepoParams,
  CartRepository,
  ChangeItemQuantityParams,
  CreateCartRepoParams,
  RemoveItemFromCartParams,
  SaveCheckoutContactParams,
  SaveCheckoutDeliveryDetailsParams,
} from "./types";

const client = graphqlClient();

type RawCustomField = {
  readonly name: string;
  readonly value: unknown;
};

const CommerceShippingAddress = Schema.Struct({
  streetName: Schema.NullOr(Schema.String),
  postalCode: Schema.NullOr(Schema.String),
  city: Schema.NullOr(Schema.String),
  country: Schema.String,
  additionalStreetInfo: Schema.NullOr(Schema.String),
  region: Schema.NullOr(Schema.String),
});

const decodeShippingAddress = (value: unknown) =>
  Schema.decodeUnknownOption(CommerceShippingAddress)(value).pipe(
    Option.flatMap((address) =>
      Schema.decodeUnknownOption(ShippingAddress)({
        addressLine1: address.streetName,
        postalCode: address.postalCode,
        city: address.city,
        country: address.country,
        ...(address.additionalStreetInfo === null
          ? {}
          : { addressLine2: address.additionalStreetInfo }),
        ...(address.region === null ? {} : { region: address.region }),
      })
    )
  );

const parseCustomJson = (value: unknown) => {
  if (typeof value !== "string") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch {
    return undefined;
  }
};

const decodeCheckoutContact = (value: unknown) =>
  Option.getOrUndefined(
    Schema.decodeUnknownOption(CheckoutContact)(parseCustomJson(value))
  );

const getCheckoutContactFromCustomFields = (
  customFields: readonly RawCustomField[] | null | undefined
) => {
  const field = customFields?.find(
    (customField) => customField.name === CHECKOUT_CONTACT_CUSTOM_FIELD_NAME
  );

  return field === undefined ? undefined : decodeCheckoutContact(field.value);
};

const getCheckoutDetails = (
  customFields: readonly RawCustomField[] | null | undefined,
  shippingAddress: ShippingAddress | null
): CheckoutDetails => {
  const contact = getCheckoutContactFromCustomFields(customFields);

  return {
    ...(contact === undefined ? {} : { contact }),
    ...(shippingAddress === null
      ? {}
      : {
          deliveryDetails: {
            source: "manual" as const,
            shippingAddress,
          },
        }),
  };
};

const CartFragment = graphql(
  `
  fragment CartFields on Cart {
    id
    version
    country
    customerEmail
    shippingAddress {
      streetName
      postalCode
      city
      country
      additionalStreetInfo
      region
    }
    store {
      key
    }
    custom {
      type {
        key
      }
      customFieldsRaw {
        name
        value
      }
    }
    lineItems {
      id
      key
      productId
      productType {
        key
      }
      name(locale: $locale)
      quantity
      variant {
        id
        sku
        attributesRaw {
          name
          value
        }
        images {
          url
          label
        }
      }
      price {
          ... ProductPrice
      }
      totalPrice {
        currencyCode
        centAmount
      }
    }
    totalLineItemQuantity
    totalPrice {
      currencyCode
      centAmount
    }
    version
    cartState
  }
`,
  [productPriceFragment]
);

const reshapeCart = (
  fragment: FragmentOf<typeof CartFragment>,
  locale: Locale
): Cart => {
  const parsedData = readFragment(CartFragment, fragment);
  const shippingAddress = Option.getOrNull(
    decodeShippingAddress(parsedData.shippingAddress)
  );

  const lineItems: LineItem[] = parsedData.lineItems.map((item) => ({
    id: item.id,
    name: item.name,
    productId: item.productId,
    quantity: item.quantity,
    price: reshapePrice(item.price),
    totalPrice: item.totalPrice
      ? {
          centAmount: item.totalPrice.centAmount,
          currencyCode: item.totalPrice.currencyCode as CurrencyCode,
        }
      : null,
    variant: item.variant
      ? {
          id: item.variant.id,
          images:
            item.variant.images.map((image) => ({
              url: image.url,
              altText: image.label ?? "",
            })) || [],
          attributes: reshapeProductAttributes(
            item.productType?.key as ProductTypeKey,
            item.variant.attributesRaw || [],
            locale
          ),
        }
      : null,
  }));

  return {
    ...parsedData,
    lineItems,
    checkoutDetails: getCheckoutDetails(
      parsedData.custom?.customFieldsRaw,
      shippingAddress
    ),
    shippingAddress,
    totalPrice: {
      centAmount: parsedData.totalPrice.centAmount,
      currencyCode: parsedData.totalPrice.currencyCode as CurrencyCode,
    },
    totalLineItemQuantity: parsedData.totalLineItemQuantity ?? 0,
  };
};

const CreateCartMutation = graphql(
  `
  mutation CreateCart($currency: Currency!, $storeId: String!, $locale: Locale!) {
    createCart(
      draft: {
        currency: $currency
        store: {
          id: $storeId
        }
      }
    ) {
      ...CartFields
    }
  }
`,
  [CartFragment]
);

const GetActiveCustomerCartQuery = graphql(
  `
  query GetActiveCart($customerId: String!, $locale: Locale!) {
    customerActiveCart(customerId: $customerId) {
      ...CartFields
    }
  }
`,
  [CartFragment]
);

const GetCartByIdQuery = graphql(
  `
  query CartById($id: String!, $locale: Locale!) {
    cart(id: $id) {
      ...CartFields
    }
  }
`,
  [CartFragment]
);

const AddItemToCartMutation = graphql(
  `
  mutation AddItemToCart($id: String!, $version: Long!, $productId: String!, $variantId: Int!, $quantity: Long!, $distributionChannelKey: String!, $locale: Locale!) {
    updateCart(
      id: $id
      version: $version
      actions: [
        {
          addLineItem: {
            productId: $productId
            variantId: $variantId
            quantity: $quantity
            distributionChannel: { key: $distributionChannelKey }
          }
        }
      ]
    ) {
      ...CartFields
    }
  }
`,
  [CartFragment]
);

const ChangeItemsQuantityMutation = graphql(
  `
    mutation ChangeItemQuantity($id: String!, $version: Long!, $lineItemId: String!, $quantity: Long!, $locale: Locale!) {
      updateCart(
        id: $id
        version: $version
        actions: [
          {
            changeLineItemQuantity: {
              lineItemId: $lineItemId
              quantity: $quantity
            }
          }
        ]
      ) {
        ...CartFields
      }
    }
  `,
  [CartFragment]
);

const RemoveItemFromCartMutation = graphql(
  `
  mutation RemoveItemFromCart($id: String!, $version: Long!, $lineItemId: String!, $locale: Locale!) {
    updateCart(
      id: $id
      version: $version
      actions: [
        {
          removeLineItem: {
            lineItemId: $lineItemId
          }
        }
      ]
    ) {
      ...CartFields
    }
  }`,
  [CartFragment]
);

const SaveCheckoutContactMutation = graphql(
  `
  mutation SaveCheckoutContact($id: String!, $version: Long!, $actions: [CartUpdateAction!]!, $locale: Locale!) {
    updateCart(
      id: $id
      version: $version
      actions: $actions
    ) {
      ...CartFields
    }
  }`,
  [CartFragment]
);

const SaveCheckoutDeliveryDetailsMutation = graphql(
  `
  mutation SaveCheckoutDeliveryDetails($id: String!, $version: Long!, $actions: [CartUpdateAction!]!, $locale: Locale!) {
    updateCart(
      id: $id
      version: $version
      actions: $actions
    ) {
      ...CartFields
    }
  }`,
  [CartFragment]
);

const hasConcurrentModificationError = (error: unknown) =>
  typeof error === "object" &&
  error !== null &&
  "extensions" in error &&
  typeof error.extensions === "object" &&
  error.extensions !== null &&
  "code" in error.extensions &&
  error.extensions.code === "ConcurrentModification";

export const getCustomerActiveCart = async (
  customerId: string,
  locale: Locale
): Promise<ActionResult<Cart>> => {
  const result = await client.query(GetActiveCustomerCartQuery, {
    customerId,
    locale,
  });

  if (result.error?.networkError) {
    return Err(
      domainError(
        "NETWORK_ERROR",
        `Failed to get active cart: ${result.error.message}`
      )
    );
  }

  if (!result.data?.customerActiveCart) {
    return Err(domainError("NOT_FOUND", "Cart not found"));
  }

  return Ok(reshapeCart(result.data.customerActiveCart, locale));
};

export const getCartById = async (
  id: string,
  locale: Locale
): Promise<ActionResult<Cart>> => {
  const result = await client.query(GetCartByIdQuery, {
    id,
    locale,
  });
  if (result.error?.networkError) {
    return Err(
      domainError(
        "NETWORK_ERROR",
        `Failed to get cart by Id: ${result.error.message}`
      )
    );
  }
  if (!result.data?.cart) {
    return Err(domainError("NOT_FOUND", "Cart not found"));
  }

  return Ok(reshapeCart(result.data.cart, locale));
};

export const createCart = async ({
  locale,
  currency,
  storeId,
}: CreateCartRepoParams): Promise<ActionResult<Cart>> => {
  const result = await client.mutation(CreateCartMutation, {
    currency,
    storeId,
    locale,
  });

  if (result.error?.networkError) {
    return Err(
      domainError(
        "NETWORK_ERROR",
        `Failed to create cart: ${result.error.message}`
      )
    );
  }

  if (!result.data?.createCart) {
    return Err(
      domainError("UNKNOWN", "Failed to create cart: No data returned")
    );
  }

  return Ok(reshapeCart(result.data.createCart, locale));
};

export const addItemToCart = async (
  params: AddToCartRepoParams
): Promise<ActionResult<Cart>> => {
  const result = await client.mutation(AddItemToCartMutation, params);

  // TODO: Handle bad input errors, like invalid variantId or quantity probably in exchange/middlware layer.
  if (result.error?.networkError) {
    return Err(
      domainError(
        "NETWORK_ERROR",
        `Failed to add item to cart: ${result.error.message}`
      )
    );
  }

  if (!result.data?.updateCart) {
    return Err(
      domainError("UNKNOWN", "Failed to add item to cart: No data returned")
    );
  }

  return Ok(reshapeCart(result.data.updateCart, params.locale));
};

export const changeItemQuantity = async (
  params: ChangeItemQuantityParams
): Promise<ActionResult<Cart>> => {
  const result = await client.mutation(ChangeItemsQuantityMutation, params);

  if (result.error?.networkError) {
    return Err(
      domainError(
        "NETWORK_ERROR",
        `Failed to change item quantity: ${result.error.message}`
      )
    );
  }

  if (!result.data?.updateCart) {
    return Err(
      domainError("UNKNOWN", "Failed to change item quantity: No data returned")
    );
  }

  return Ok(reshapeCart(result.data.updateCart, params.locale));
};

export const removeItemFromCart = async (
  params: RemoveItemFromCartParams
): Promise<ActionResult<Cart>> => {
  const result = await client.mutation(RemoveItemFromCartMutation, params);

  if (result.error?.networkError) {
    return Err(
      domainError(
        "NETWORK_ERROR",
        `Failed to remove item from cart: ${result.error.message}`
      )
    );
  }

  if (!result.data?.updateCart) {
    return Err(
      domainError(
        "UNKNOWN",
        "Failed to remove item from cart: No data returned"
      )
    );
  }

  return Ok(reshapeCart(result.data.updateCart, params.locale));
};

export const saveCheckoutContact = async (
  params: SaveCheckoutContactParams
): Promise<ActionResult<Cart>> => {
  const actions = buildSaveCheckoutContactActions(params.cart, params.contact);

  if (!actions.ok) {
    return actions;
  }

  const result = await client.mutation(SaveCheckoutContactMutation, {
    id: params.cart.id,
    version: params.cart.version,
    actions: actions.data,
    locale: params.locale,
  });

  if (result.error?.graphQLErrors.some(hasConcurrentModificationError)) {
    return Err(
      domainError(
        "CONFLICT",
        "Checkout Cart changed before Contact could be saved"
      )
    );
  }

  if (result.error?.networkError) {
    return Err(
      domainError(
        "NETWORK_ERROR",
        `Failed to save checkout contact: ${result.error.message}`
      )
    );
  }

  if (result.error) {
    return Err(
      domainError(
        "UNKNOWN",
        `Failed to save checkout contact: ${result.error.message}`
      )
    );
  }

  if (!result.data?.updateCart) {
    return Err(
      domainError(
        "UNKNOWN",
        "Failed to save checkout contact: No data returned"
      )
    );
  }

  return Ok(reshapeCart(result.data.updateCart, params.locale));
};

export const saveCheckoutDeliveryDetails = async (
  params: SaveCheckoutDeliveryDetailsParams
): Promise<ActionResult<Cart>> => {
  const result = await client.mutation(SaveCheckoutDeliveryDetailsMutation, {
    id: params.cart.id,
    version: params.cart.version,
    actions: buildSaveCheckoutDeliveryDetailsActions(params.deliveryDetails),
    locale: params.locale,
  });

  if (result.error?.graphQLErrors.some(hasConcurrentModificationError)) {
    return Err(
      domainError(
        "CONFLICT",
        "Checkout Cart changed before Delivery Details could be saved"
      )
    );
  }

  if (result.error?.networkError) {
    return Err(
      domainError(
        "NETWORK_ERROR",
        `Failed to save checkout delivery details: ${result.error.message}`
      )
    );
  }

  if (result.error) {
    return Err(
      domainError(
        "UNKNOWN",
        `Failed to save checkout delivery details: ${result.error.message}`
      )
    );
  }

  if (!result.data?.updateCart) {
    return Err(
      domainError(
        "UNKNOWN",
        "Failed to save checkout delivery details: No data returned"
      )
    );
  }

  return Ok(reshapeCart(result.data.updateCart, params.locale));
};

export const cartRepo: CartRepository = {
  getCustomerActiveCart,
  getCartById,
  createCart,
  addItemToCart,
  changeItemQuantity,
  removeItemFromCart,
  saveCheckoutContact,
  saveCheckoutDeliveryDetails,
};
