import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "vitest";

const workspaceRoot = resolve(__dirname, "../../..");

const webRegistrationAdapters = [
  "apps/web/lib/registration-effect-actions.ts",
  "apps/web/lib/admin-registration-effect.ts",
  "apps/web/lib/registration-rest-client.ts",
  "apps/web/app/[locale]/register/page.tsx",
  "apps/web/app/admin/registration-approvals/page.tsx",
];

test("current web registration adapters do not call legacy registration RPC", () => {
  for (const relativePath of webRegistrationAdapters) {
    const source = readFileSync(resolve(workspaceRoot, relativePath), "utf8");

    expect(source, relativePath).not.toContain("/rpc/registration");
    expect(source, relativePath).not.toContain("registrationClient");
    expect(source, relativePath).not.toContain("adminRegistrationClient");
    expect(source, relativePath).not.toContain("@repo/registration/orpc");
  }
});
