import {
  registrationApprovalDecisionSchema,
  registrationInputSchema,
  registrationWorkflowInputSchema,
} from "@repo/registration/orpc/schemas";
import { expect, test } from "vitest";

test("registration input requires company and account fields", () => {
  const parsed = registrationInputSchema.parse({
    companyName: "Hydra Industrial",
    contactFirstName: "Ava",
    contactLastName: "Stone",
    email: "ava@example.com",
    address: {
      streetName: "Canal Street",
      postalCode: "10013",
      city: "New York",
      region: "NY",
      country: "US",
    },
  });

  expect(parsed.companyName).toBe("Hydra Industrial");
  expect(parsed.address.country).toBe("US");
});

test("registration input requires region for US and CA", () => {
  expect(() =>
    registrationInputSchema.parse({
      companyName: "Hydra Industrial",
      contactFirstName: "Ava",
      contactLastName: "Stone",
      email: "ava@example.com",
      address: {
        streetName: "Canal Street",
        postalCode: "10013",
        city: "New York",
        country: "US",
      },
    })
  ).toThrow();

  expect(
    registrationInputSchema.parse({
      companyName: "Hydra Industrial",
      contactFirstName: "Ava",
      contactLastName: "Stone",
      email: "ava@example.com",
      address: {
        streetName: "King Street",
        postalCode: "M5V 1J2",
        city: "Toronto",
        region: "ON",
        country: "CA",
      },
    }).address.region
  ).toBe("ON");
});

test("workflow input accepts registration data without auth identity", () => {
  const parsed = registrationWorkflowInputSchema.parse({
    registrationId: crypto.randomUUID(),
    companyName: "Hydra Industrial",
    contactFirstName: "Ava",
    contactLastName: "Stone",
    email: "ava@example.com",
    address: {
      streetName: "Canal Street",
      postalCode: "10013",
      city: "New York",
      region: "NY",
      country: "US",
    },
  });

  expect(parsed.registrationId).toBeTypeOf("string");
});

test("workflow input rejects legacy auth fields", () => {
  expect(() =>
    registrationWorkflowInputSchema.parse({
      registrationId: crypto.randomUUID(),
      companyName: "Hydra Industrial",
      contactFirstName: "Ava",
      contactLastName: "Stone",
      email: "ava@example.com",
      password: "Password123!",
      address: {
        streetName: "Canal Street",
        postalCode: "10013",
        city: "New York",
        country: "US",
      },
    })
  ).toThrow();
});

test("registration input rejects unexpected legacy auth fields", () => {
  expect(() =>
    registrationInputSchema.parse({
      companyName: "Hydra Industrial",
      contactFirstName: "Ava",
      contactLastName: "Stone",
      email: "ava@example.com",
      username: "ava.stone",
      password: "short",
      address: {
        streetName: "Canal Street",
        postalCode: "10013",
        city: "New York",
        region: "NY",
        country: "US",
      },
    })
  ).toThrow();
});

test("approval schema accepts both decisions", () => {
  expect(
    registrationApprovalDecisionSchema.parse({ decision: "approved" }).decision
  ).toBe("approved");
  expect(
    registrationApprovalDecisionSchema.parse({ decision: "rejected" }).decision
  ).toBe("rejected");
});
