import { describe, expect, it } from "vitest";

import { applicationTasks } from "../src/tasks.ts";

describe("application task environment", () => {
  it("does not promote the build-only production hostname from selected environment examples into global cache inputs", () => {
    const config = applicationTasks(
      ["apps/web/.env.example", "apps/api/.env.example"].map((target) => ({
        content: new TextEncoder().encode(
          'VERCEL_PROJECT_PRODUCTION_URL="site.example"\nCMS_TOKEN="secret"\n'
        ),
        mode: 0o644,
        target,
      }))
    );

    expect(config.globalEnv).not.toContain("VERCEL_PROJECT_PRODUCTION_URL");
    expect(config.tasks.build.env).toContain("VERCEL_PROJECT_PRODUCTION_URL");
    expect(config.globalEnv).toContain("CMS_TOKEN");
  });
});
