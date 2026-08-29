/* oxlint-disable typescript/promise-function-async -- Test doubles return already-settled promises to implement the asynchronous janitor port. */
import { describe, expect, it } from "vitest";

import {
  makeCommercetoolsJanitor,
  makeCommercetoolsRegistrationJanitor,
} from "./commercetools-janitor";

describe("makeCommercetoolsRegistrationJanitor", () => {
  it("deletes a Registration using its latest stored version", async () => {
    const deleted: object[] = [];
    const janitor = makeCommercetoolsRegistrationJanitor({
      deleteRegistration: (registration) => {
        deleted.push(registration);
        return Promise.resolve();
      },
      getRegistration: (registrationId) =>
        Promise.resolve({ key: registrationId, version: 4 }),
    });

    await janitor.deleteRegistration("registration-1");

    expect(deleted).toStrictEqual([{ key: "registration-1", version: 4 }]);
  });

  it("treats an absent Registration as already cleaned", async () => {
    const janitor = makeCommercetoolsRegistrationJanitor({
      deleteRegistration: () =>
        Promise.reject(new Error("should not delete an absent Registration")),
      getRegistration: () => Promise.resolve(null),
    });

    await expect(
      janitor.deleteRegistration("registration-missing")
    ).resolves.toBeUndefined();
  });
});

describe("makeCommercetoolsJanitor", () => {
  it("deletes a Business Unit before deleting all of its direct Customers", async () => {
    const operations: string[] = [];
    const janitor = makeCommercetoolsJanitor({
      deleteBusinessUnit: (businessUnit) => {
        operations.push(
          `delete-business-unit:${businessUnit.id}:${businessUnit.version}`
        );
        return Promise.resolve();
      },
      deleteCompanyMemberInvitationRecords: (businessUnitId) => {
        operations.push(`delete-invitations:${businessUnitId}`);
        return Promise.resolve();
      },
      deleteCustomer: (customer) => {
        operations.push(`delete-customer:${customer.id}:${customer.version}`);
        return Promise.resolve();
      },
      getBusinessUnit: (businessUnitId) =>
        Promise.resolve({
          associates: [
            { customerId: "customer-administrator" },
            { customerId: "customer-member" },
          ],
          id: businessUnitId,
          version: 7,
        }),
      getCustomer: (customerId) =>
        Promise.resolve({
          id: customerId,
          version: customerId === "customer-administrator" ? 3 : 4,
        }),
      hasBusinessUnitMembership: () => Promise.resolve(false),
    });

    await janitor.deleteCommerceAccount({
      businessUnitId: "business-unit-1",
      customerId: "customer-administrator",
    });

    expect(operations).toStrictEqual([
      "delete-invitations:business-unit-1",
      "delete-business-unit:business-unit-1:7",
      "delete-customer:customer-administrator:3",
      "delete-customer:customer-member:4",
    ]);
  });

  it("retries an associate Customer after the Business Unit was deleted", async () => {
    const deletedCustomerIds = new Set<string>();
    let businessUnitExists = true;
    let memberDeletionAttempts = 0;
    const janitor = makeCommercetoolsJanitor({
      deleteBusinessUnit: () => {
        businessUnitExists = false;
        return Promise.resolve();
      },
      deleteCompanyMemberInvitationRecords: () => Promise.resolve(),
      deleteCustomer: (customer) => {
        if (customer.id === "customer-member") {
          memberDeletionAttempts += 1;
          if (memberDeletionAttempts === 1) {
            return Promise.reject(
              new Error("Commercetools temporarily unavailable")
            );
          }
        }
        deletedCustomerIds.add(customer.id);
        return Promise.resolve();
      },
      getBusinessUnit: (businessUnitId) =>
        Promise.resolve(
          businessUnitExists
            ? {
                associates: [
                  { customerId: "customer-administrator" },
                  { customerId: "customer-member" },
                ],
                id: businessUnitId,
                version: 7,
              }
            : null
        ),
      getCustomer: (customerId) =>
        Promise.resolve(
          deletedCustomerIds.has(customerId)
            ? null
            : { id: customerId, version: 3 }
        ),
      hasBusinessUnitMembership: () => Promise.resolve(false),
    });
    const account = {
      businessUnitId: "business-unit-1",
      customerId: "customer-administrator",
    };

    await expect(janitor.deleteCommerceAccount(account)).rejects.toThrow(
      "Commercetools temporarily unavailable"
    );
    await expect(
      janitor.deleteCommerceAccount(account)
    ).resolves.toBeUndefined();

    expect(businessUnitExists).toBeFalsy();
    expect(memberDeletionAttempts).toBe(2);
    expect(deletedCustomerIds).toStrictEqual(
      new Set(["customer-administrator", "customer-member"])
    );
  });

  it("keeps a shared Customer until its final Business Unit is deleted", async () => {
    const businessUnits = new Map([
      [
        "business-unit-1",
        {
          associates: [
            { customerId: "customer-administrator-1" },
            { customerId: "customer-shared" },
          ],
          id: "business-unit-1",
          version: 1,
        },
      ],
      [
        "business-unit-2",
        {
          associates: [
            { customerId: "customer-administrator-2" },
            { customerId: "customer-shared" },
          ],
          id: "business-unit-2",
          version: 1,
        },
      ],
    ]);
    const deletedCustomerIds = new Set<string>();
    const janitor = makeCommercetoolsJanitor({
      deleteBusinessUnit: (businessUnit) => {
        businessUnits.delete(businessUnit.id);
        return Promise.resolve();
      },
      deleteCompanyMemberInvitationRecords: () => Promise.resolve(),
      deleteCustomer: (customer) => {
        deletedCustomerIds.add(customer.id);
        return Promise.resolve();
      },
      getBusinessUnit: (businessUnitId) =>
        Promise.resolve(businessUnits.get(businessUnitId) ?? null),
      getCustomer: (customerId) =>
        Promise.resolve(
          deletedCustomerIds.has(customerId)
            ? null
            : { id: customerId, version: 1 }
        ),
      hasBusinessUnitMembership: (customerId) =>
        Promise.resolve(
          [...businessUnits.values()].some(({ associates }) =>
            associates.some((associate) => associate.customerId === customerId)
          )
        ),
    });

    await janitor.deleteCommerceAccount({
      businessUnitId: "business-unit-2",
      customerId: "customer-administrator-2",
    });
    expect(deletedCustomerIds).not.toContain("customer-shared");

    await janitor.deleteCommerceAccount({
      businessUnitId: "business-unit-1",
      customerId: "customer-administrator-1",
    });
    expect(deletedCustomerIds).toContain("customer-shared");
  });
});
