import { graphql } from '../graphql';
import { graphqlClient } from '../client';

const GetActiveCartQuery = graphql(`
  query GetActiveCart($customerId: String!) {
    customerActiveCart(customerId: $customerId) {
      id
      version
      lineItems {
        id
        key
        productId
        name(locale: "en")
        quantity
        price {
          value {
            currencyCode
            centAmount
          }
        }
        totalPrice {
          currencyCode
          centAmount
        }
      }
      totalPrice {
        currencyCode
        centAmount
      }
      cartState
    }
  }
`);

const CreateCartMutation = graphql(`
  mutation CreateCart($draft: CartDraft!) {
    createCart(draft: $draft) {
      id
      version
      lineItems {
        id
        key
        productId
        name(locale: "en")
        quantity
        price {
          value {
            currencyCode
            centAmount
          }
        }
        totalPrice {
          currencyCode
          centAmount
        }
      }
      totalPrice {
        currencyCode
        centAmount
      }
      cartState
    }
  }
`);

export async function getActiveCart(customerId: string) {
  const client = graphqlClient();
  
  try {
    const result = await client.query(GetActiveCartQuery, {
      customerId,
    });

    if (result.error) {
      throw new Error(`Failed to get active cart: ${result.error.message}`);
    }

    return result.data?.customerActiveCart;
  } catch (error) {
    console.error('Error getting active cart:', error);
    throw error;
  }
}

export async function createCart(customerId?: string, currency: string = 'USD') {
  const client = graphqlClient();
  
  try {
    const result = await client.mutation(CreateCartMutation, {
      draft: {
        currency,
        customerId,
      },
    });

    if (result.error) {
      throw new Error(`Failed to create cart: ${result.error.message}`);
    }

    return result.data?.createCart;
  } catch (error) {
    console.error('Error creating cart:', error);
    throw error;
  }
}

export async function getOrCreateActiveCart(customerId: string, currency: string = 'USD') {
  try {
    const activeCart = await getActiveCart(customerId);
    if (activeCart) {
      return activeCart;
    }
  } catch (error) {
    // Cart might not exist, continue to create one
    console.log('No active cart found, creating new one...');
  }
  
  return await createCart(customerId, currency);
}
