/** Templates own structure; selected registry items bind module references to slots. */
/* oxlint-disable unicorn/no-array-sort, unicorn/no-array-reverse -- Only newly filtered/copied arrays are mutated; the CLI targets ES2022. */
import { readFile } from "node:fs/promises";
import path from "node:path";

import { format } from "oxfmt";
import type { RegistryItem } from "shadcn/schema";
import { z } from "zod";

import { resolveWorkspacePath } from "./paths.js";

export const slotCompositionSchema = z
  .object({
    slotBindings: z
      .array(
        z
          .object({
            as: z
              .string()
              .regex(/^[A-Za-z_$][\w$]*$/u)
              .optional(),
            export: z.string().regex(/^[A-Za-z_$][\w$]*$/u),
            module: z.string().min(1),
            order: z.number().int().default(0),
            slot: z.string().min(1),
            target: z.string().min(1),
          })
          .strict()
      )
      .default([]),
    templates: z
      .array(
        z
          .object({
            slots: z.record(
              z.enum([
                "wrapper",
                "element",
                "call",
                "factory",
                "members",
                "graphql",
              ])
            ),
            source: z.string().min(1),
            target: z.string().min(1),
          })
          .strict()
      )
      .default([]),
  })
  .strict();

type SlotDefinition = z.infer<typeof slotCompositionSchema>;
export type PlannedSlotTemplate = SlotDefinition["templates"][number] & {
  owner: string;
  slotBindings: (SlotDefinition["slotBindings"][number] & {
    owner: string;
  })[];
};

export function planSlotTemplates(
  items: RegistryItem[]
): PlannedSlotTemplate[] {
  const definitions = items.map((item) => ({
    owner: item.name,
    ...slotCompositionSchema.parse(item.meta?.composition ?? {}),
  }));
  const templates = definitions.flatMap(
    ({ owner, templates: ownedTemplates }) =>
      ownedTemplates.map((template) => ({
        owner,
        ...template,
        source: resolveWorkspacePath(
          template.source,
          "composition template source"
        ),
        target: resolveWorkspacePath(template.target, "composition target"),
      }))
  );
  const slotBindings = definitions.flatMap(
    ({ owner, slotBindings: ownedSlotBindings }) =>
      ownedSlotBindings.map((binding) => ({
        owner,
        ...binding,
        target: resolveWorkspacePath(binding.target, "composition target"),
      }))
  );
  if (
    new Set(templates.map((template) => template.target)).size !==
    templates.length
  ) {
    throw new Error(
      "A composition target must have exactly one template owner."
    );
  }
  for (const binding of slotBindings) {
    const template = templates.find(
      (candidate) => candidate.target === binding.target
    );
    if (!template || !Object.hasOwn(template.slots, binding.slot)) {
      throw new Error(
        `${binding.owner}: missing target or slot ${binding.target}#${binding.slot}`
      );
    }
  }
  return templates
    .map((template) => ({
      ...template,
      slotBindings: slotBindings
        .filter((binding) => binding.target === template.target)
        .sort(
          (a, b) =>
            a.order - b.order ||
            a.owner.localeCompare(b.owner) ||
            a.export.localeCompare(b.export)
        ),
    }))
    .sort((left, right) => left.target.localeCompare(right.target));
}

export async function renderPlannedSlotTemplates(
  sourceRoot: string,
  templates: PlannedSlotTemplate[]
) {
  return await Promise.all(
    templates.map(async (template) => {
      const selected = template.slotBindings;
      const imports = selected.map((binding) => ({
        ...binding,
        local: binding.as ?? binding.export,
      }));
      if (
        new Set(imports.map((binding) => binding.local)).size !== imports.length
      ) {
        throw new Error(
          `${template.target} has conflicting import names; give slot bindings distinct 'as' names.`
        );
      }
      const values = new Map<string, string>([
        [
          "imports",
          imports
            .map(
              (binding) =>
                `import { ${binding.export}${binding.local === binding.export ? "" : ` as ${binding.local}`} } from ${JSON.stringify(binding.module)};`
            )
            .join("\n"),
        ],
      ]);
      for (const [slot, kind] of Object.entries(template.slots)) {
        const entries = imports.filter((binding) => binding.slot === slot);
        if (kind === "element" && entries.length > 1) {
          throw new Error(
            `${template.target}#${slot} accepts at most one element.`
          );
        }
        if (kind === "wrapper" || kind === "call") {
          values.set(
            `${slot}.open`,
            entries
              .map((binding) =>
                kind === "wrapper" ? `<${binding.local}>` : `${binding.local}(`
              )
              .join("")
          );
          values.set(
            `${slot}.close`,
            [...entries]
              .reverse()
              .map((binding) =>
                kind === "wrapper" ? `</${binding.local}>` : ")"
              )
              .join("")
          );
        } else if (kind === "graphql") {
          values.set(
            `${slot}.spreads`,
            entries.map((binding) => `...${binding.export}`).join("\n")
          );
          values.set(
            `${slot}.documents`,
            entries.map((binding) => binding.local).join(", ")
          );
        } else {
          values.set(
            slot,
            entries
              .map((binding) => {
                if (kind === "element") {
                  return `<${binding.local} />`;
                }
                if (kind === "members") {
                  return binding.local;
                }
                return `${binding.local}()`;
              })
              .join(", ")
          );
        }
      }
      let content = await readFile(
        path.join(
          sourceRoot,
          resolveWorkspacePath(template.source, "composition template source")
        ),
        "utf-8"
      );
      for (const [name, value] of values) {
        const marker = `{{${name}}}`;
        if (content.split(marker).length !== 2) {
          throw new Error(
            `${template.source} must contain exactly one ${marker}.`
          );
        }
        content = content.replace(marker, () => value);
      }
      content = content.replaceAll(
        /\{\{#(?<slot>\w+)\}\}(?<body>[\s\S]*?)\{\{\/\k<slot>\}\}/gu,
        (_match, slot: string, body: string) => {
          if (!Object.hasOwn(template.slots, slot)) {
            throw new Error(
              `${template.source} has an undeclared conditional slot: ${slot}`
            );
          }
          return selected.some((binding) => binding.slot === slot) ? body : "";
        }
      );
      if (/\{\{[^}]+\}\}/u.test(content)) {
        throw new Error(`${template.source} has an undeclared marker.`);
      }
      const formatted = await format(template.target, content, {
        printWidth: 80,
        sortImports: { ignoreCase: true, newlinesBetween: true, order: "asc" },
        trailingComma: "es5",
      });
      if (formatted.errors.length > 0) {
        throw new Error(
          `${template.source} produced invalid source: ${formatted.errors.map((error) => error.message).join("; ")}`
        );
      }
      return {
        content: formatted.code,
        owner: template.owner,
        slotBindings: selected,
        source: template.source,
        target: resolveWorkspacePath(template.target, "composition target"),
      };
    })
  );
}

export async function renderSlotTemplates(
  sourceRoot: string,
  items: RegistryItem[]
) {
  return await renderPlannedSlotTemplates(sourceRoot, planSlotTemplates(items));
}
