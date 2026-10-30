import { stripVTControlCharacters } from "node:util";

import { Effect } from "effect";
import type { RegistryItem } from "shadcn/schema";
import { describe, expect, it } from "vitest";

import { registryInstructions } from "../src/registry.ts";
import {
  groupSetupInstructions,
  renderSetupInstructions,
} from "../src/setup-instructions.ts";

const item = (name: string, setup?: unknown): RegistryItem => ({
  name,
  type: "registry:item",
  docs: "Long technical documentation stays out of the setup checklist.",
  ...(setup === undefined ? {} : { meta: { setup } }),
});
const command =
  "pnpm cli search provision \\\n  --locale <locale> --output search.env";
const base = {
  group: "search",
  title: "Search · Algolia",
  order: 40,
  steps: [
    {
      id: "search.provision",
      title: "Provision search",
      order: 20,
      commands: [command],
    },
  ],
};

describe("package setup instructions", () => {
  it("puts optional groups last and renders their labels and frames in yellow", async () => {
    const instructions = await Effect.runPromise(
      registryInstructions([
        item("monitoring", {
          group: "observability",
          title: "Monitoring · Sentry",
          order: 0,
          optional: true,
          steps: [
            {
              id: "sentry.connect",
              title: "Connect reporting",
              order: 10,
              commands: ["pnpm example"],
            },
          ],
        }),
        item("search", base),
      ])
    );
    expect(
      groupSetupInstructions(instructions).map((group) => group.group)
    ).toEqual(["search", "observability"]);
    const plain = renderSetupInstructions(instructions, {
      color: false,
      width: 72,
    });
    const colored = renderSetupInstructions(instructions, {
      color: true,
      width: 72,
    });
    expect(colored).toContain("\u001b[33m┌─ Monitoring · Sentry · Optional");
    expect(plain).toContain("Monitoring · Sentry · Optional");
    expect(stripVTControlCharacters(colored)).toBe(plain);
    expect(plain).not.toContain("\u001b[");
    for (const line of plain.split("\n").filter((line) => /^[│┌└]/u.test(line)))
      expect(line.length).toBe(72);
  });

  it("preserves optional recipe steps when they join a required group", async () => {
    const instructions = await Effect.runPromise(
      registryInstructions([
        item("optional-recipe", {
          ...base,
          optional: true,
          order: 0,
          steps: [
            { id: "search.extra", title: "Enable extra telemetry", order: 0 },
          ],
        }),
        item("search", base),
      ])
    );
    const groups = groupSetupInstructions(instructions);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.optional).toBe(false);
    expect(groups[0]?.steps.map((step) => step.id)).toEqual([
      "search.provision",
      "search.extra",
    ]);
    const colored = renderSetupInstructions(instructions, {
      color: true,
      width: 72,
    });
    expect(colored).toContain("\u001b[36m┌─ Search · Algolia");
    expect(stripVTControlCharacters(colored)).toContain(
      "2. Enable extra telemetry · Optional"
    );
    expect(colored).toContain("\u001b[33m");
  });

  it("labels and orders an individual optional step after required work", async () => {
    const instructions = await Effect.runPromise(
      registryInstructions([
        item("search", {
          ...base,
          steps: [
            {
              id: "search.optional",
              title: "Extra setup",
              order: 0,
              optional: true,
            },
            ...base.steps,
          ],
        }),
      ])
    );
    const plain = renderSetupInstructions(instructions, {
      color: false,
      width: 72,
    });
    expect(plain).toContain("1. Provision search");
    expect(plain).toContain("2. Extra setup · Optional");
  });

  it("merges recipe guidance into its package frame before the shared provision command", async () => {
    const instructions = await Effect.runPromise(
      registryInstructions([
        item("integration", {
          ...base,
          steps: [
            {
              id: "search.commerce",
              title: "Prepare Commerce access",
              order: 10,
            },
          ],
        }),
        item("search", base),
        item("cms", {
          group: "cms",
          title: "CMS",
          order: 10,
          steps: [{ id: "cms.connect", title: "Connect the stack", order: 10 }],
        }),
      ])
    );
    const groups = groupSetupInstructions(instructions);
    expect(groups.map((group) => group.group)).toEqual(["cms", "search"]);
    const plain = renderSetupInstructions(instructions, {
      color: false,
      width: 72,
    });
    expect(plain.match(/┌─ Search/gu)).toHaveLength(1);
    expect(plain.match(/pnpm cli search provision/gu)).toHaveLength(1);
    expect(plain.indexOf("1. Prepare Commerce access")).toBeLessThan(
      plain.indexOf("2. Provision search")
    );
    expect(plain).not.toContain("Long technical documentation");
    expect(plain).toContain("$ pnpm cli search provision \\");
    expect(plain).toContain("--locale <locale> --output search.env");
    const colored = renderSetupInstructions(instructions, {
      color: true,
      width: 72,
    });
    expect(colored).toContain("\u001b[");
    expect(stripVTControlCharacters(colored)).toBe(plain);
    expect(plain).not.toContain("\u001b[");
    for (const line of plain.split("\n").filter((line) => /^[│┌└]/u.test(line)))
      expect(line.length).toBe(72);
  });

  it("keeps third-party docs visible inside a frame when structured guidance is absent", async () => {
    const instructions = await Effect.runPromise(
      registryInstructions([item("third-party")])
    );
    const text = renderSetupInstructions(instructions, {
      color: false,
      width: 48,
    });
    expect(text).toContain("┌─ third-party");
    expect(text).toContain("1. Setup notes");
    expect(text).toContain("Long technical documentation");
  });

  it("rejects malformed authored setup metadata instead of silently dropping instructions", async () => {
    const error = await Effect.runPromise(
      registryInstructions([
        item("broken", { ...base, steps: "provision" }),
      ]).pipe(Effect.flip)
    );
    expect(error).toMatchObject({
      _tag: "InvalidComposition",
      message: "Invalid setup instructions: broken",
    });
  });
});
