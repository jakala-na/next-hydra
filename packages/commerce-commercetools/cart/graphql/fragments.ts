import { graphql } from "../../graphql";
import { productPriceFragment } from "../price";

export const CartFragment = graphql(
	`
    fragment CartFields on Cart {
      id
      version
      country
      customerEmail
      shippingAddress {
        key
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
      businessUnit {
        id
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
          ...ProductPrice
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
	[productPriceFragment],
);
