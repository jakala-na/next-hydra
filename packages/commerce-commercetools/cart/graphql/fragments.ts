import { graphql } from "../../graphql";
import { productPriceFragment } from "../price";

export const CartFragment = graphql(
  `
    fragment CartFields on Cart {
      id
      version
      shippingMode
      country
      customerId
      customerEmail
      shippingAddress {
        key
        streetName
        postalCode
        city
        country
        additionalStreetInfo
        region
        state
      }
      billingAddress {
        key
        streetName
        postalCode
        city
        country
        additionalStreetInfo
        region
        state
      }
      itemShippingAddresses {
        key
        streetName
        postalCode
        city
        country
        additionalStreetInfo
        region
        state
      }
      shipping {
        shippingKey
        shippingAddress {
          key
          streetName
          postalCode
          city
          country
          additionalStreetInfo
          region
          state
        }
        shippingInfo {
          shippingMethodName
          shippingMethodState
          shippingMethodRef {
            id
          }
          price {
            currencyCode
            centAmount
          }
        }
      }
      store {
        key
      }
      businessUnit {
        id
      }
      paymentInfo {
        paymentRefs {
          id
        }
        payments {
          id
          key
          amountPlanned {
            currencyCode
            centAmount
          }
          interfaceId
          paymentMethodInfo {
            method
            paymentInterface
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
        }
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
          attributeDefinitions(includeNames: ["model"]) {
            results {
              name
              labelAllLocales {
                locale
                value
              }
            }
          }
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
        shippingDetails {
          targets {
            addressKey
            quantity
            shippingMethodKey
          }
          valid
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
