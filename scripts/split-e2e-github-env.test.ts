import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { parseEnv } from "node:util";

import { afterEach, describe, test } from "vitest";

const scriptPath = path.resolve(import.meta.dirname, "split-e2e-github-env.ts");
const temporaryDirectories: string[] = [];

describe("split-e2e-github-env", () => {
  afterEach(() => {
    for (const temporaryDirectory of temporaryDirectories.splice(0)) {
      try {
        rmSync(temporaryDirectory, { force: true, recursive: true });
      } catch {
        // The operating system will eventually clean its temporary directory.
      }
    }
  });

  const createFixture = (files: readonly string[]) => {
    const temporaryDirectory = mkdtempSync(
      path.join(os.tmpdir(), "split-e2e-github-env-")
    );
    temporaryDirectories.push(temporaryDirectory);

    return {
      paths: files.map((contents, index) => {
        const filePath = path.join(
          temporaryDirectory,
          `input-${index + 1}.env`
        );
        writeFileSync(filePath, contents, "utf-8");
        return filePath;
      }),
      temporaryDirectory,
    };
  };

  test("uses app-scoped authorities for customer and admin WorkOS values", () => {
    const { paths, temporaryDirectory } = createFixture([
      [
        "WORKOS_API_KEY=web-customer-key",
        "WORKOS_COOKIE_PASSWORD=customer-cookie-password",
        "CONTENTSTACK_API_KEY=content-key",
        "UNUSED_VALUE=ignored",
      ].join("\n"),
      [
        "WORKOS_API_KEY=api-customer-key",
        "ADMIN_WORKOS_API_KEY=admin-key",
        "COMMERCETOOLS_REGION=us-central1.gcp",
        "RESEND_FROM=Demo <demo@example.com>",
        "RESEND_TOKEN='token value'",
      ].join("\n"),
      [
        "WORKOS_API_KEY=admin-key",
        "WORKOS_COOKIE_PASSWORD=admin-cookie-password",
      ].join("\n"),
    ]);

    const result = spawnSync(process.execPath, [scriptPath, ...paths], {
      cwd: temporaryDirectory,
      encoding: "utf-8",
    });

    assert.equal(result.status, 0, result.stderr);
    assert.deepEqual(
      parseEnv(
        readFileSync(
          path.join(temporaryDirectory, ".env.github.secrets"),
          "utf-8"
        )
      ),
      {
        ADMIN_WORKOS_API_KEY: "admin-key",
        ADMIN_WORKOS_COOKIE_PASSWORD: "admin-cookie-password",
        CONTENTSTACK_API_KEY: "content-key",
        RESEND_TOKEN: "token value",
        WORKOS_API_KEY: "api-customer-key",
        WORKOS_COOKIE_PASSWORD: "customer-cookie-password",
      }
    );
    assert.deepEqual(
      parseEnv(
        readFileSync(
          path.join(temporaryDirectory, ".env.github.variables"),
          "utf-8"
        )
      ),
      {
        COMMERCETOOLS_REGION: "us-central1.gcp",
        RESEND_FROM: "Demo <demo@example.com>",
      }
    );
    assert.equal(
      statSync(path.join(temporaryDirectory, ".env.github.secrets")).mode %
        0o1000,
      0o600
    );
  });

  test("requires exactly three input files", () => {
    const { paths, temporaryDirectory } = createFixture(["ONE=1\n", "TWO=2\n"]);

    const result = spawnSync(process.execPath, [scriptPath, ...paths], {
      cwd: temporaryDirectory,
      encoding: "utf-8",
    });

    assert.equal(result.status, 1);
    assert.match(result.stderr, /Usage: pnpm e2e:env:split/u);
  });
});
