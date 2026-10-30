import { stripVTControlCharacters } from "node:util";

import { describe, expect, it } from "vitest";

import { renderReport } from "./output-render";
import { runtimeEnvironmentNextTasks } from "./runtime-environment-output";

const manifest = [
  { key: "PROVIDER_KEY", applications: ["web", "api"], sensitive: true },
] as const;

describe("provisioning receipt presentation", () => {
  it("frames a receipt and follow-up work together without corrupting commands or color widths", () => {
    const report = {
      title: "CMS · Example",
      outcome: "action-required",
      summary: "The service is provisioned.",
      sections: [
        {
          title: "Provisioned",
          facts: [{ label: "Project", value: "example" }],
        },
      ],
      tasks: [
        {
          id: "verify",
          title: "Verify delivery",
          where: "Your application",
          detail:
            "Check the configured service using the generated runtime configuration. This paragraph is long enough to wrap across several terminal lines while remaining inside the provider's frame.",
          commands: ["pnpm cli verify --project example"],
          verify: "The check succeeds.",
        },
      ],
    } as const;
    const plain = renderReport(report, { color: false, width: 72 });
    const color = renderReport(report, { color: true, width: 72 });
    expect(plain).toContain("┌─ CMS · Example");
    expect(plain).toContain("$ pnpm cli verify --project example");
    expect(plain).toContain("Verify: The check succeeds.");
    expect(stripVTControlCharacters(color)).toBe(plain);
    for (const line of plain.split("\n").filter((line) => /^[│┌└]/u.test(line)))
      expect(line.length).toBe(72);
  });

  it("targets only the applications declared by the provider for a local publication", () => {
    const tasks = runtimeEnvironmentNextTasks(
      { destination: "local", path: "/private/provider.env", mode: 0o600 },
      manifest
    );
    expect(tasks).toHaveLength(1);
    expect(tasks[0]?.where).toBe("apps/web, apps/api");
    expect(tasks[0]?.detail).toContain("/private/provider.env");
    expect(tasks[0]?.detail).toContain("not automatically loaded");
    expect(tasks[0]?.where).not.toContain("admin");
  });

  it("uses actual Vercel project/environment receipts instead of local-copy instructions", () => {
    const tasks = runtimeEnvironmentNextTasks(
      {
        destination: "vercel",
        deploymentRequired: true,
        environments: ["preview:feature"],
        publicationMode: "create",
        projects: [
          {
            application: "api",
            projectId: "api-project",
            organizationId: "org",
            variables: ["PROVIDER_KEY"],
          },
        ],
      },
      manifest
    );
    expect(tasks[0]?.id).toBe("runtime.redeploy");
    expect(tasks[0]?.where).toContain("api-project");
    expect(tasks[0]?.where).toContain("preview:feature");
    expect(tasks[0]?.where).not.toContain("web");
    expect(tasks[0]?.detail).not.toContain("credential file");
  });
});
