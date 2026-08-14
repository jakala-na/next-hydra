import { expect, test } from "vitest";
import { GET as getDocs } from "../app/docs/route";
import { GET } from "../app/openapi.json/route";
import { applicationOpenApi } from "../lib/openapi";

const HTTP_OK = 200;
const documentedOperations = [
  {
    method: "get",
    operationId: "checkout.addressBook",
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
  expect(Object.keys(applicationOpenApi.paths).sort()).toEqual(
    documentedPaths.sort()
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
  expect(await response.json()).toEqual(applicationOpenApi);
});

test("serves Scalar for the aggregate API", async () => {
  const response = await getDocs(new Request("http://api.test/docs"));
  const html = await response.text();

  expect(response.status).toBe(HTTP_OK);
  expect(response.headers.get("content-type")).toContain("text/html");
  expect(html).toContain("Next Hydra API");
  expect(html).toContain('id="api-reference"');
  expect(html).toContain("checkout.addressBook");
  expect(html).toContain("registrations.create");
});
