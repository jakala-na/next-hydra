import { stripVTControlCharacters } from "node:util";

import { Effect } from "effect";
import type { RegistryItem } from "shadcn/schema";
import { describe, expect, it } from "vitest";

import { registryInstructions } from "../src/registry.ts";
import type { SetupInstructions } from "../src/setup-instructions.ts";
import {
  groupSetupInstructions,
  renderSetupInstructions,
} from "../src/setup-instructions.ts";

const item = (name: string, setup?: SetupInstructions): RegistryItem => {
  const result: RegistryItem = {
    docs: "Long technical documentation stays out of the setup checklist.",
    name,
    type: "registry:item",
  };
  if (setup !== undefined) {
    result.meta = { setup };
  }
  return result;
};
const coloredText = (text: string) => text.includes("\u001B[");
const command =
  "pnpm cli search provision \\\n  --locale <locale> --output search.env";
const base = {
  group: "search",
  order: 40,
  steps: [
    {
      id: "search.provision",
      title: "Provision search",
      order: 20,
      commands: [command],
    },
  ],
  title: "Search · Algolia",
};

describe("package setup instructions", () => {
  it("puts optional groups last and renders their labels and frames in yellow", async () => {
    const instructions = await Effect.runPromise(
      registryInstructions([
        item("monitoring", {
          group: "observability",
          optional: true,
          order: 0,
          steps: [
            {
              id: "sentry.connect",
              title: "Connect reporting",
              order: 10,
              commands: ["pnpm example"],
            },
          ],
          title: "Monitoring · Sentry",
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
    expect(colored).toContain("\u001B[33m┌─ Monitoring · Sentry · Optional");
    expect(plain).toContain("Monitoring · Sentry · Optional");
    expect(stripVTControlCharacters(colored)).toBe(plain);
    expect(plain).not.toContain("\u001B[");
    for (const line of plain
      .split("\n")
      .filter((line) => /^[│┌└]/u.test(line))) {
      expect(line).toHaveLength(72);
    }
  });

  it("preserves optional recipe steps when they join a required group", async () => {
    const instructions = await Effect.runPromise(
      registryInstructions([
        item("optional-recipe", {
          ...base,
          optional: true,
          order: 0,
          steps: [
            { id: "search.extra", order: 0, title: "Enable extra telemetry" },
          ],
        }),
        item("search", base),
      ])
    );
    const groups = groupSetupInstructions(instructions);
    expect(
      groups.map(({ optional, steps }) => ({
        optional,
        steps: steps.map(({ id }) => id),
      }))
    ).toEqual([
      { optional: false, steps: ["search.provision", "search.extra"] },
    ]);
    const colored = renderSetupInstructions(instructions, {
      color: true,
      width: 72,
    });
    expect(colored).toContain("\u001B[36m┌─ Search · Algolia");
    expect(stripVTControlCharacters(colored)).toContain(
      "2. Enable extra telemetry · Optional"
    );
    expect(colored).toContain("\u001B[33m");
  });

  it("labels and orders an individual optional step after required work", async () => {
    const instructions = await Effect.runPromise(
      registryInstructions([
        item("search", {
          ...base,
          steps: [
            {
              id: "search.optional",
              optional: true,
              order: 0,
              title: "Extra setup",
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
    for (const fragment of [
      "1. Provision search",
      "2. Extra setup · Optional",
    ]) {
      expect(plain).toContain(fragment);
    }
  });

  it("merges recipe guidance into its package frame before the shared provision command", async () => {
    const instructions = await Effect.runPromise(
      registryInstructions([
        item("integration", {
          ...base,
          steps: [
            {
              id: "search.commerce",
              order: 10,
              title: "Prepare Commerce access",
            },
          ],
        }),
        item("search", base),
        item("cms", {
          group: "cms",
          order: 10,
          steps: [{ id: "cms.connect", title: "Connect the stack", order: 10 }],
          title: "CMS",
        }),
      ])
    );
    const groups = groupSetupInstructions(instructions);
    expect(groups.map((group) => group.group)).toEqual(["cms", "search"]);
    const plain = renderSetupInstructions(instructions, {
      color: false,
      width: 72,
    });
    expect({
      searchFrames: plain.match(/┌─ Search/gu)?.length,
      provisionCommands: plain.match(/pnpm cli search provision/gu)?.length,
      color: coloredText(plain),
      legacyDocs: plain.includes("Long technical documentation"),
    }).toEqual({
      searchFrames: 1,
      provisionCommands: 1,
      color: false,
      legacyDocs: false,
    });
    expect(plain.indexOf("1. Prepare Commerce access")).toBeLessThan(
      plain.indexOf("2. Provision search")
    );
    for (const fragment of [
      "$ pnpm cli search provision \\",
      "--locale <locale> --output search.env",
    ]) {
      expect(plain).toContain(fragment);
    }
    const colored = renderSetupInstructions(instructions, {
      color: true,
      width: 72,
    });
    expect({
      color: coloredText(colored),
      plain: stripVTControlCharacters(colored),
    }).toEqual({ color: true, plain });
    for (const line of plain
      .split("\n")
      .filter((line) => /^[│┌└]/u.test(line))) {
      expect(line).toHaveLength(72);
    }
  });

  it("keeps third-party docs visible inside a frame when structured guidance is absent", async () => {
    const instructions = await Effect.runPromise(
      registryInstructions([item("third-party")])
    );
    const text = renderSetupInstructions(instructions, {
      color: false,
      width: 48,
    });
    for (const fragment of [
      "┌─ third-party",
      "1. Setup notes",
      "Long technical documentation",
    ]) {
      expect(text).toContain(fragment);
    }
  });

  it("rejects malformed authored setup metadata instead of silently dropping instructions", async () => {
    const error = await Effect.runPromise(
      registryInstructions([
        { ...item("broken"), meta: { setup: { ...base, steps: "provision" } } },
      ]).pipe(Effect.flip)
    );
    expect(error).toMatchObject({
      _tag: "InvalidComposition",
      message: "Invalid setup instructions: broken",
    });
  });
});
