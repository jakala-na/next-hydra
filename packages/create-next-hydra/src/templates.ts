import { Array as EffectArray, Effect, Order, Schema } from "effect";
import { format } from "oxfmt";
import type { RegistryItem } from "shadcn/schema";

import { InvalidComposition } from "./errors.ts";
import { relativeFile } from "./files.ts";
import { parseTemplate, renderParsedTemplate } from "./template-language.ts";
import type { TemplateContext } from "./template-language.ts";

const Identifier = Schema.String.check(Schema.isPattern(/^[A-Za-z_$][\w$]*$/u));
export const Binding = Schema.Struct({
  as: Schema.optionalKey(Identifier),
  export: Identifier,
  module: Schema.NonEmptyString,
  order: Schema.optionalKey(Schema.Int),
  slot: Schema.NonEmptyString,
  target: Schema.NonEmptyString,
});
const Template = Schema.Struct({
  slots: Schema.Record(
    Schema.String,
    Schema.Literals([
      "members",
      "wrapper",
      "element",
      "call",
      "factory",
      "graphql",
    ])
  ),
  source: Schema.NonEmptyString,
  target: Schema.NonEmptyString,
});
export const TemplateDefinition = Schema.Struct({
  slotBindings: Schema.optionalKey(Schema.Array(Binding)),
  templates: Schema.optionalKey(Schema.Array(Template)),
});
export type Template = typeof Template.Type;
export type Binding = typeof Binding.Type & { readonly owner: string };

export const readTemplateDefinitions = Effect.fn("Composition.templates")(
  function* (items: readonly RegistryItem[], published: ReadonlySet<string>) {
    const definitions = new Map<string, typeof TemplateDefinition.Type>();
    for (const item of items) {
      const definition = yield* Schema.decodeUnknownEffect(TemplateDefinition)(
        item.meta?.composition ?? {},
        { onExcessProperty: "error" }
      );
      if (published.has(item.name) && (definition.templates?.length ?? 0) > 0) {
        return yield* new InvalidComposition({
          message: `Published artifact ${item.name} cannot read source-only templates. Publish materialized files or bindings to templates owned by the source checkout.`,
        });
      }
      const slotBindings = [];
      for (const binding of definition.slotBindings ?? []) {
        slotBindings.push({
          ...binding,
          target: yield* relativeFile(binding.target),
        });
      }
      const templates = [];
      for (const template of definition.templates ?? []) {
        templates.push({
          ...template,
          source: yield* relativeFile(template.source),
          target: yield* relativeFile(template.target),
        });
      }
      definitions.set(item.name, { slotBindings, templates });
    }
    return definitions;
  }
);

export const orderBindings = (
  bindings: readonly Binding[]
): readonly Binding[] =>
  EffectArray.sort(
    bindings,
    (a: Binding, b: Binding) =>
      Order.Number(a.order ?? 0, b.order ?? 0) ||
      Order.String(a.owner, b.owner) ||
      Order.String(a.export, b.export)
  );

export const renderTemplate = Effect.fn("Composition.renderTemplate")(
  function* (template: Template, bindings: readonly Binding[], source: string) {
    const selected = orderBindings(bindings);
    const locals = selected.map((binding) => binding.as ?? binding.export);
    if (new Set(locals).size !== locals.length) {
      return yield* new InvalidComposition({
        message: `Conflicting imports for ${template.target}`,
      });
    }
    const context: TemplateContext = {
      enabled: {},
      imports: selected
        .map(
          (binding) =>
            `import { ${binding.export}${binding.as ? ` as ${binding.as}` : ""} } from ${JSON.stringify(binding.module)};`
        )
        .join("\n"),
      slots: {},
    };
    for (const [slot, kind] of Object.entries(template.slots)) {
      const slotBindings = selected.filter((binding) => binding.slot === slot);
      const entries = slotBindings.map(
        (binding) => binding.as ?? binding.export
      );
      if (kind === "element" && entries.length > 1) {
        return yield* new InvalidComposition({
          message: `${template.target}#${slot} accepts at most one element`,
        });
      }
      context.enabled[slot] = entries.length > 0;
      if (kind === "wrapper" || kind === "call") {
        context.slots[slot] = {
          close: EffectArray.reverse(entries)
            .map((name) => (kind === "wrapper" ? `</${name}>` : ")"))
            .join(""),
          open: entries
            .map((name) => (kind === "wrapper" ? `<${name}>` : `${name}(`))
            .join(""),
        };
      } else if (kind === "graphql") {
        context.slots[slot] = {
          documents: entries.join(", "),
          spreads: slotBindings
            .map((binding) => `...${binding.export}`)
            .join("\n"),
        };
      } else {
        context.slots[slot] = entries
          .map((name) => {
            if (kind === "element") {
              return `<${name} />`;
            }
            if (kind === "factory") {
              return `${name}()`;
            }
            return name;
          })
          .join(", ");
      }
    }
    const content = yield* Effect.try({
      catch: (error) => new InvalidComposition({ message: String(error) }),
      try: () => renderParsedTemplate(parseTemplate(template, source), context),
    });
    const formatted = yield* Effect.tryPromise({
      catch: () =>
        new InvalidComposition({ message: `Cannot format ${template.target}` }),
      try: async () =>
        await format(template.target, content, {
          printWidth: 80,
          sortImports: {
            ignoreCase: true,
            newlinesBetween: true,
            order: "asc",
          },
          trailingComma: "es5",
        }),
    });
    if (formatted.errors.length) {
      return yield* new InvalidComposition({
        message: `Invalid rendered source: ${template.target}`,
      });
    }
    return formatted.code;
  }
);
