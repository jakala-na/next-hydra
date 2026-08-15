import { expect, test } from "vitest";

import { GET as getDocs } from "../app/docs/route";
import { GET } from "../app/openapi.json/route";
import { applicationOpenApi } from "../lib/openapi";

const HTTP_OK = 200;
const documentedOperations = [
  {
    method: "get",
    operationId: "addressBook.list",
    path: "/address-book",
  },
  {
    method: "post",
    operationId: "checkout.saveContact",
    path: "/checkout/contact",
  },
  {
    method: "get",
    operationId: "checkout.current",
    path: "/checkout/current",
  },
  {
    method: "post",
    operationId: "checkout.saveDeliveryDetails",
    path: "/checkout/delivery-details",
  },
  {
    method: "get",
    operationId: "registrations.list",
    path: "/registrations",
  },
  {
    method: "post",
    operationId: "registrations.create",
    path: "/registrations",
  },
  {
    method: "get",
    operationId: "registrations.get",
    path: "/registrations/{registrationId}",
  },
  {
    method: "post",
    operationId: "registrations.approve",
    path: "/registrations/{registrationId}/approve",
  },
  {
    method: "post",
    operationId: "registrations.reject",
    path: "/registrations/{registrationId}/reject",
  },
] as const;

test("combines every Effect HTTP API into one OpenAPI document", () => {
  expect(applicationOpenApi.info).toMatchObject({
    title: "Next Hydra API",
    version: "1.0.0",
  });
  const documentedPaths = [
    ...new Set(documentedOperations.map(({ path }) => path)),
  ];
  expect(new Set(Object.keys(applicationOpenApi.paths))).toStrictEqual(
    new Set(documentedPaths)
  );

  const operationIds = documentedOperations.map(
    ({ method, operationId, path }) => {
      const operation = applicationOpenApi.paths[path]?.[method];
      expect(
        operation,
        `missing OpenAPI operation ${method.toUpperCase()} ${path}`
      ).toBeDefined();
      expect(operation?.operationId).toBe(operationId);
      return operation?.operationId;
    }
  );

  expect(new Set(operationIds).size).toBe(documentedOperations.length);
});

test("exposes the aggregate document from the API app", async () => {
  const response = GET();

  expect(response.status).toBe(HTTP_OK);
  expect(response.headers.get("content-type")).toContain("application/json");
  await expect(response.json()).resolves.toStrictEqual(applicationOpenApi);
});

test("documents Address Book independently and never exposes anonymous cart ids as inputs", () => {
  const addressBookOperation = applicationOpenApi.paths["/address-book"]?.get;

  expect(addressBookOperation?.security).toStrictEqual([{ accessToken: [] }]);
  expect(
    new Set(Object.keys(addressBookOperation?.responses ?? {}))
  ).toStrictEqual(new Set(["200", "400", "401", "403", "500"]));
  expect(JSON.stringify(applicationOpenApi)).not.toContain(
    "x-context-anonymous-cart-id"
  );
  expect(applicationOpenApi.components?.securitySchemes).toHaveProperty(
    "accessToken"
  );
});

test("documents checkout authentication as optional without exposing identity context", () => {
  const checkoutOperations = [
    applicationOpenApi.paths["/checkout/current"]?.get,
    applicationOpenApi.paths["/checkout/contact"]?.post,
    applicationOpenApi.paths["/checkout/delivery-details"]?.post,
  ];

  for (const operation of checkoutOperations) {
    expect(operation?.security).toStrictEqual([{}, { accessToken: [] }]);
    const successResponse = operation?.responses?.["200"] as
      | {
          content?: {
            "application/json"?: {
              schema?: { properties?: { scope?: unknown } };
            };
          };
        }
      | undefined;
    const serializedSuccess = JSON.stringify(
      successResponse?.content?.["application/json"]?.schema
    );
    expect(serializedSuccess).not.toContain("anonymousCartId");
    expect(serializedSuccess).not.toContain("customerId");
    expect(serializedSuccess).not.toContain("businessUnitId");
    expect(serializedSuccess).not.toContain("businessUnitKey");
  }

  expect(JSON.stringify(checkoutOperations[0]?.responses)).not.toContain(
    "CheckoutDeliveryDetailsApi"
  );
  expect(JSON.stringify(checkoutOperations[1]?.responses)).not.toContain(
    "CheckoutDeliveryDetailsApi"
  );
  expect(JSON.stringify(checkoutOperations[2]?.responses)).toContain(
    "CheckoutDeliveryDetailsApi"
  );
});

test("keeps checkout conflict schemas specific to each mutation", () => {
  const saveContact = applicationOpenApi.paths["/checkout/contact"]?.post;
  const saveDeliveryDetails =
    applicationOpenApi.paths["/checkout/delivery-details"]?.post;

  const contactConflict =
    applicationOpenApi.components?.schemas?.CheckoutApiConflict;
  const deliveryConflict =
    applicationOpenApi.components?.schemas?.CheckoutDeliveryDetailsApiConflict;

  expect(JSON.stringify(contactConflict)).not.toContain("addressBookReference");
  expect(JSON.stringify(saveContact?.responses)).not.toContain(
    "CheckoutDeliveryDetailsApiConflict"
  );
  expect(JSON.stringify(saveDeliveryDetails?.responses)).toContain(
    "CheckoutDeliveryDetailsApiConflict"
  );
  expect(JSON.stringify(deliveryConflict)).toContain("addressBookReference");
});

test("documents registration permissions and operation-specific errors", () => {
  const create = applicationOpenApi.paths["/registrations"]?.post;
  const list = applicationOpenApi.paths["/registrations"]?.get;
  const get = applicationOpenApi.paths["/registrations/{registrationId}"]?.get;
  const approve =
    applicationOpenApi.paths["/registrations/{registrationId}/approve"]?.post;
  const reject =
    applicationOpenApi.paths["/registrations/{registrationId}/reject"]?.post;

  expect(create?.security).toStrictEqual([]);
  expect(new Set(Object.keys(create?.responses ?? {}))).toStrictEqual(
    new Set(["201", "400", "409", "422", "500"])
  );

  for (const operation of [list, get, approve, reject]) {
    expect(operation?.security).toStrictEqual([{ accessToken: [] }]);
  }

  expect(new Set(Object.keys(list?.responses ?? {}))).toStrictEqual(
    new Set(["200", "400", "401", "403", "500", "503"])
  );
  expect(new Set(Object.keys(get?.responses ?? {}))).toStrictEqual(
    new Set(["200", "400", "401", "403", "404", "500", "503"])
  );
  expect(new Set(Object.keys(approve?.responses ?? {}))).toStrictEqual(
    new Set(["200", "400", "401", "403", "404", "409", "500", "503"])
  );
  expect(reject?.responses).toStrictEqual(approve?.responses);
});

test("keeps registration reviewer identity out of the public decision request", () => {
  const decisionSchema = applicationOpenApi.components?.schemas
    ?.RegistrationDecisionRequest as
    | { properties?: Record<string, unknown> }
    | undefined;

  expect(Object.keys(decisionSchema?.properties ?? {})).toStrictEqual([
    "reason",
  ]);
  const serializedDocument = JSON.stringify(applicationOpenApi);
  expect(serializedDocument).not.toContain("x-registration-approval-secret");
  expect(serializedDocument).not.toContain("RegistrationReviewerInput");
});

test("does not generate duplicate numbered error schemas", () => {
  const numberedSchemas = Object.keys(
    applicationOpenApi.components?.schemas ?? {}
  ).filter((name) => /\d$/u.test(name));

  expect(numberedSchemas).toStrictEqual([]);
});

test("serves Scalar for the aggregate API", async () => {
  const response = await getDocs(new Request("http://api.test/docs"));
  const html = await response.text();

  expect(response.status).toBe(HTTP_OK);
  expect(response.headers.get("content-type")).toContain("text/html");
  expect(html).toContain("Next Hydra API");
  expect(html).toContain('id="api-reference"');
  expect(html).toContain("addressBook.list");
  expect(html).toContain("registrations.create");
});
