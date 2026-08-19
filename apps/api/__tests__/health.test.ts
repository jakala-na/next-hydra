import { expect, test } from "vitest";

import { GET } from "../app/health/route";

test("Health Check", async () => {
  const response = await GET();
  expect(response.status).toBe(200);
  await expect(response.text()).resolves.toBe("OK");
});
