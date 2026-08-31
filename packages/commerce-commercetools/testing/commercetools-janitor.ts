import type { ByProjectKeyRequestBuilder } from "@commercetools/platform-sdk";
import { Option, Schema } from "effect";

import {
  DEFAULT_COMPANY_MEMBER_INVITATION_CONTAINER,
  DEFAULT_REGISTRATION_CONTAINER,
} from "../versioned-store";

interface CommercetoolsVersionedResource {
  readonly id: string;
  readonly version: number;
}

interface CommercetoolsBusinessUnitResource extends CommercetoolsVersionedResource {
  readonly associates: readonly { readonly customerId: string }[];
  readonly key: string;
}

export interface CommercetoolsJanitorApi {
  readonly deleteCompanyMemberInvitationRecords: (
    businessUnitId: string
  ) => Promise<void>;
  readonly deleteBusinessUnit: (
    businessUnit: CommercetoolsVersionedResource
  ) => Promise<void>;
  readonly deleteCartsForBusinessUnit: (
    businessUnitKey: string
  ) => Promise<void>;
  readonly deleteCustomer: (
    customer: CommercetoolsVersionedResource
  ) => Promise<void>;
  readonly getBusinessUnit: (
    businessUnitId: string
  ) => Promise<CommercetoolsBusinessUnitResource | null>;
  readonly getCustomer: (
    customerId: string
  ) => Promise<CommercetoolsVersionedResource | null>;
  readonly hasBusinessUnitMembership: (customerId: string) => Promise<boolean>;
}

export interface CommercetoolsAccountReference {
  readonly businessUnitId: string;
  readonly customerId: string;
}

export interface CommercetoolsCartJanitorApi {
  readonly deleteCart: (cart: CommercetoolsVersionedResource) => Promise<void>;
  readonly getCart: (
    cartId: string
  ) => Promise<CommercetoolsVersionedResource | null>;
}

export interface CommercetoolsRegistrationJanitorApi {
  readonly deleteRegistration: (registration: {
    readonly key: string;
    readonly version: number;
  }) => Promise<void>;
  readonly getRegistration: (
    registrationId: string
  ) => Promise<{ readonly key: string; readonly version: number } | null>;
}

const isNotFound = Schema.is(
  Schema.Struct({ statusCode: Schema.Literal(404) })
);

const CompanyMemberInvitationRecordValue = Schema.Struct({
  intent: Schema.Struct({ businessUnitId: Schema.String }),
});
const CART_PAGE_SIZE = 500;
const CUSTOM_OBJECT_PAGE_SIZE = 500;

const deleteCartsForBusinessUnit = async (
  apiRoot: ByProjectKeyRequestBuilder,
  businessUnitKey: string
) => {
  while (true) {
    // Always read the first page because each completed iteration deletes it.
    // oxlint-disable-next-line no-await-in-loop -- The next page depends on the preceding deletions.
    const response = await apiRoot
      .carts()
      .get({
        queryArgs: {
          limit: CART_PAGE_SIZE,
          where: `businessUnit(key=${JSON.stringify(businessUnitKey)})`,
          withTotal: false,
        },
      })
      .execute();

    // oxlint-disable-next-line no-await-in-loop -- Deleting the current page must complete before the same page is queried again.
    await Promise.all(
      response.body.results.map(async (cart) => {
        try {
          await apiRoot
            .carts()
            .withId({ ID: cart.id })
            .delete({ queryArgs: { version: cart.version } })
            .execute();
        } catch (error) {
          if (!isNotFound(error)) {
            throw error;
          }
        }
      })
    );

    if (response.body.results.length < CART_PAGE_SIZE) {
      break;
    }
  }
};

const deleteCompanyMemberInvitationRecords = async (
  apiRoot: ByProjectKeyRequestBuilder,
  container: string,
  businessUnitId: string
) => {
  const records: {
    readonly businessUnitId: string | undefined;
    readonly key: string;
    readonly version: number;
  }[] = [];
  let offset = 0;

  while (true) {
    // oxlint-disable-next-line no-await-in-loop -- Each stable page offset depends on the preceding response length.
    const response = await apiRoot
      .customObjects()
      .withContainer({ container })
      .get({
        queryArgs: {
          limit: CUSTOM_OBJECT_PAGE_SIZE,
          offset,
          sort: "key asc",
          withTotal: false,
        },
      })
      .execute();
    records.push(
      ...response.body.results.map((record) => ({
        businessUnitId: Option.getOrUndefined(
          Schema.decodeUnknownOption(CompanyMemberInvitationRecordValue)(
            record.value
          )
        )?.intent.businessUnitId,
        key: record.key,
        version: record.version,
      }))
    );
    if (response.body.results.length < CUSTOM_OBJECT_PAGE_SIZE) {
      break;
    }
    offset += response.body.results.length;
  }

  await Promise.all(
    records
      .filter((record) => record.businessUnitId === businessUnitId)
      .map(async (record) => {
        try {
          await apiRoot
            .customObjects()
            .withContainerAndKey({ container, key: record.key })
            .delete({ queryArgs: { version: record.version } })
            .execute();
        } catch (error) {
          if (!isNotFound(error)) {
            throw error;
          }
        }
      })
  );
};

export const makeCommercetoolsJanitor = (api: CommercetoolsJanitorApi) => {
  const pendingCustomerIds = new Set<string>();

  return {
    deleteCommerceAccount: async (account: CommercetoolsAccountReference) => {
      await api.deleteCompanyMemberInvitationRecords(account.businessUnitId);
      const businessUnit = await api.getBusinessUnit(account.businessUnitId);
      pendingCustomerIds.add(account.customerId);
      for (const associate of businessUnit?.associates ?? []) {
        pendingCustomerIds.add(associate.customerId);
      }

      if (businessUnit !== null) {
        await api.deleteCartsForBusinessUnit(businessUnit.key);
        await api.deleteBusinessUnit(businessUnit);
      }

      const failures: unknown[] = [];
      await Promise.all(
        [...pendingCustomerIds].map(async (customerId) => {
          try {
            if (await api.hasBusinessUnitMembership(customerId)) {
              return;
            }
            const customer = await api.getCustomer(customerId);
            if (customer !== null) {
              await api.deleteCustomer(customer);
            }
            pendingCustomerIds.delete(customerId);
          } catch (error) {
            failures.push(error);
          }
        })
      );

      if (failures.length === 1) {
        throw failures[0];
      }
      if (failures.length > 1) {
        throw new AggregateError(
          failures,
          `Failed to delete Customers for Business Unit ${account.businessUnitId}`
        );
      }
    },
  };
};

export const makeCommercetoolsRegistrationJanitor = (
  api: CommercetoolsRegistrationJanitorApi
) => ({
  deleteRegistration: async (registrationId: string) => {
    const registration = await api.getRegistration(registrationId);
    if (registration !== null) {
      await api.deleteRegistration(registration);
    }
  },
});

export const makeCommercetoolsCartJanitor = (
  api: CommercetoolsCartJanitorApi
) => ({
  deleteCart: async (cartId: string) => {
    const cart = await api.getCart(cartId);
    if (cart !== null) {
      await api.deleteCart(cart);
    }
  },
});

export const makeCommercetoolsJanitorFromApiRoot = (
  apiRoot: ByProjectKeyRequestBuilder,
  companyMemberInvitationContainer = process.env
    .COMPANY_MEMBER_INVITATION_CONTAINER ??
    DEFAULT_COMPANY_MEMBER_INVITATION_CONTAINER,
  registrationContainer = process.env.REGISTRATION_CONTAINER ??
    DEFAULT_REGISTRATION_CONTAINER
) => ({
  ...makeCommercetoolsCartJanitor({
    deleteCart: async (cart) => {
      try {
        await apiRoot
          .carts()
          .withId({ ID: cart.id })
          .delete({ queryArgs: { version: cart.version } })
          .execute();
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
      }
    },
    getCart: async (cartId) => {
      try {
        const response = await apiRoot
          .carts()
          .withId({ ID: cartId })
          .get()
          .execute();
        return { id: response.body.id, version: response.body.version };
      } catch (error) {
        if (isNotFound(error)) {
          return null;
        }
        throw error;
      }
    },
  }),
  ...makeCommercetoolsJanitor({
    deleteBusinessUnit: async (businessUnit) => {
      try {
        await apiRoot
          .businessUnits()
          .withId({ ID: businessUnit.id })
          .delete({ queryArgs: { version: businessUnit.version } })
          .execute();
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
      }
    },
    deleteCartsForBusinessUnit: async (businessUnitKey) => {
      await deleteCartsForBusinessUnit(apiRoot, businessUnitKey);
    },
    deleteCompanyMemberInvitationRecords: async (businessUnitId) => {
      await deleteCompanyMemberInvitationRecords(
        apiRoot,
        companyMemberInvitationContainer,
        businessUnitId
      );
    },
    deleteCustomer: async (customer) => {
      try {
        await apiRoot
          .customers()
          .withId({ ID: customer.id })
          .delete({ queryArgs: { version: customer.version } })
          .execute();
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
      }
    },
    getBusinessUnit: async (businessUnitId) => {
      try {
        const response = await apiRoot
          .businessUnits()
          .withId({ ID: businessUnitId })
          .get()
          .execute();
        return {
          associates: (response.body.associates ?? []).map((associate) => ({
            customerId: associate.customer.id,
          })),
          id: response.body.id,
          key: response.body.key,
          version: response.body.version,
        };
      } catch (error) {
        if (isNotFound(error)) {
          return null;
        }
        throw error;
      }
    },
    getCustomer: async (customerId) => {
      try {
        const response = await apiRoot
          .customers()
          .withId({ ID: customerId })
          .get()
          .execute();
        return { id: response.body.id, version: response.body.version };
      } catch (error) {
        if (isNotFound(error)) {
          return null;
        }
        throw error;
      }
    },
    hasBusinessUnitMembership: async (customerId) => {
      const response = await apiRoot
        .businessUnits()
        .get({
          queryArgs: {
            limit: 1,
            where: `associates(customer(id=${JSON.stringify(customerId)})) or inheritedAssociates(customer(id=${JSON.stringify(customerId)}))`,
          },
        })
        .execute();
      return response.body.results.length > 0;
    },
  }),
  ...makeCommercetoolsRegistrationJanitor({
    deleteRegistration: async (registration) => {
      try {
        await apiRoot
          .customObjects()
          .withContainerAndKey({
            container: registrationContainer,
            key: registration.key,
          })
          .delete({ queryArgs: { version: registration.version } })
          .execute();
      } catch (error) {
        if (!isNotFound(error)) {
          throw error;
        }
      }
    },
    getRegistration: async (registrationId) => {
      try {
        const response = await apiRoot
          .customObjects()
          .withContainerAndKey({
            container: registrationContainer,
            key: registrationId,
          })
          .get()
          .execute();
        return {
          key: response.body.key,
          version: response.body.version,
        };
      } catch (error) {
        if (isNotFound(error)) {
          return null;
        }
        throw error;
      }
    },
  }),
});
