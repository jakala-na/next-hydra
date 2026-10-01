import { describe, expect, it } from "@effect/vitest";
import { Effect, FileSystem, Path, Schema } from "effect";
import { format } from "oxfmt";
import ts from "typescript";

import {
  isCompositionTemplate,
  eligiblePackageFile,
} from "../src/file-policy.ts";
import { runtime } from "../src/runtime.ts";
import { parseTemplate } from "../src/template-language.ts";
import { renderTemplate, TemplateDefinition } from "../src/templates.ts";
import type { Binding, Template } from "../src/templates.ts";

const example: Template = {
  slots: { account: "element" },
  source: "example.template.tsx",
  target: "example.tsx",
};
const source = `/*{% echo imports %}*/
export const content = <main>{ /*{% if enabled.account %}*/
  {/*{{ slots.account }}*/}
  /*{% endif %}*/ }</main>;`;

describe("Comment-based composition templates", () => {
  it("reports conditional typos in branches that would not render", () => {
    expect(() =>
      parseTemplate(
        example,
        source.replace("enabled.account", "enabled.acount")
      )
    ).toThrow(
      /example\.template\.tsx:\d+:\d+: unknown template variable: enabled\.acount/u
    );
  });

  it("rejects missing or repeated slot output even when it appears in a condition", () => {
    expect(() =>
      parseTemplate(example, source.replace("{/*{{ slots.account }}*/}", ""))
    ).toThrow("must emit exactly one slots.account");
    expect(() =>
      parseTemplate(example, `${source}\n/*{% echo slots.account %}*/`)
    ).toThrow("must emit exactly one slots.account");
    expect(() =>
      parseTemplate(
        example,
        source
          .replace("enabled.account", "slots.account")
          .replace("{/*{{ slots.account }}*/}", "")
      )
    ).toThrow("must emit exactly one slots.account");
  });

  it("rejects dynamic paths and tags outside the statically checked contract", () => {
    expect(() =>
      parseTemplate(
        example,
        source.replace("enabled.account", "enabled[imports]")
      )
    ).toThrow("dynamic template paths");
    expect(() =>
      parseTemplate(example, `/*{% assign local = imports %}*/\n${source}`)
    ).toThrow("unsupported template tag: assign");
  });

  it.each(["output", "echo"])(
    "does not count a filter argument as a required slot %s",
    (directive) => {
      const filtered = "slots.account | default: slots.cart";
      const output =
        directive === "output"
          ? `{/*{{ ${filtered} }}*/}`
          : `/*{% echo ${filtered} %}*/`;
      expect(() =>
        parseTemplate(
          { ...example, slots: { account: "element", cart: "element" } },
          directive === "output"
            ? `/*{% echo imports %}*/ export const content = <main>${output}</main>;`
            : `/*{% echo imports %}*/ ${output} export const content = <main />;`
        )
      ).toThrow("must emit exactly one slots.cart");
      expect(() =>
        parseTemplate(
          { ...example, slots: { account: "element", cart: "element" } },
          `/*{% echo imports %}*/
export const content = <main>{/*{{ slots.account | default: slots.cart }}*/}{/*{{ slots.cart }}*/}</main>;`
        )
      ).not.toThrow();
      expect(() =>
        parseTemplate(
          example,
          source.replace(
            "slots.account",
            "slots.account | default: slots.acount"
          )
        )
      ).toThrow("unknown template variable: slots.acount");
    }
  );

  it("distinguishes quoted property names from nested paths in skipped branches", () => {
    const wrapper: Template = { ...example, slots: { commerce: "wrapper" } };
    const authored = `/*{% echo imports %}*/
/*{% if enabled.commerce %}*/
export const content = <main>
  {/*{{ slots["commerce.open"] }}*/}
  {/*{{ slots.commerce.close }}*/}
</main>;
/*{% endif %}*/`;
    expect(() => parseTemplate(wrapper, authored)).toThrow(
      "unknown template variable"
    );
    expect(() =>
      parseTemplate(
        wrapper,
        authored.replace('slots["commerce.open"]', 'slots["commerce"]["open"]')
      )
    ).not.toThrow();
  });

  it("preserves declared slot names containing dots", () => {
    const dotted: Template = {
      ...example,
      slots: { "account.extra": "element" },
    };
    const authored = source
      .replace("enabled.account", 'enabled["account.extra"]')
      .replace("slots.account", 'slots["account.extra"]');
    expect(() => parseTemplate(dotted, authored)).not.toThrow();
    expect(() =>
      parseTemplate(
        dotted,
        authored.replace('slots["account.extra"]', "slots.account.extra")
      )
    ).toThrow("unknown template variable");
  });

  it("reports native syntax errors before rendering", () => {
    expect(() =>
      parseTemplate(example, `${source}\nexport const broken = ;`)
    ).toThrow("Expression expected");
  });

  it("keeps native-extension template authoring files out of copied package source", () => {
    for (const file of [
      "components/example.template.tsx",
      "example.template.ts",
      "example.ts.template",
    ]) {
      expect(isCompositionTemplate(file)).toBeTruthy();
      expect(eligiblePackageFile(file)).toBeFalsy();
    }
    expect(eligiblePackageFile("example.ts")).toBeTruthy();
  });

  it.effect(
    "renders every production template before and after formatting, with empty and selected bindings",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const root = path.resolve(import.meta.dirname, "../../..");
        const definitions: Template[] = [];
        for (const registry of [
          "apps/web",
          "apps/cli",
          "packages/cms-contentstack",
          "packages/cms-drupal",
          "packages/search",
          "packages/search-algolia",
          "tests/e2e",
        ]) {
          const decoded = yield* Schema.decodeEffect(
            Schema.fromJsonString(
              Schema.Struct({
                items: Schema.Array(
                  Schema.Struct({
                    meta: Schema.optionalKey(
                      Schema.Struct({
                        composition: Schema.optionalKey(TemplateDefinition),
                      })
                    ),
                  })
                ),
              })
            )
          )(
            yield* fs.readFileString(path.join(root, registry, "registry.json"))
          );
          definitions.push(
            ...decoded.items.flatMap(
              (item) => item.meta?.composition?.templates ?? []
            )
          );
        }
        expect(definitions).toHaveLength(18);
        for (const template of definitions) {
          const authored = yield* fs.readFileString(
            path.join(root, template.source)
          );
          const formatted = yield* Effect.promise(
            async () => await format(template.source, authored)
          );
          expect(formatted.errors).toHaveLength(0);
          const bindings: Binding[] = Object.keys(template.slots).map(
            (slot, index) => ({
              export: `Binding${index}`,
              module: "./bindings",
              owner: "test",
              slot,
              target: template.target,
            })
          );
          for (const selected of [[], bindings]) {
            const before = yield* renderTemplate(template, selected, authored);
            const after = yield* renderTemplate(
              template,
              selected,
              formatted.code
            );
            expect({ output: after, source: template.source }).toEqual({
              output: before,
              source: template.source,
            });
          }
        }
      }).pipe(Effect.provide(runtime))
  );

  it.effect(
    "renders all 64 optional layout combinations without leaking inactive properties or directives",
    () =>
      Effect.gen(function* () {
        const fs = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const template: Template = {
          slots: {
            account: "element",
            businessUnit: "element",
            cart: "element",
            commerce: "wrapper",
            mobileSearch: "element",
            search: "element",
          },
          source: "apps/web/registry/templates/layout.template.tsx",
          target: "apps/web/app/[locale]/layout.tsx",
        };
        const authored = yield* fs.readFileString(
          path.resolve(import.meta.dirname, "../../../", template.source)
        );
        const slots = Object.keys(template.slots);
        for (let mask = 0; mask < 64; mask += 1) {
          const selected: Binding[] = slots
            .filter((_, index) => Math.floor(mask / 2 ** index) % 2 === 1)
            .map((slot) => ({
              export: `Selected_${slot}`,
              module: `./${slot}`,
              owner: "test",
              slot,
              target: template.target,
            }));
          const output = yield* renderTemplate(template, selected, authored);
          const parsed = ts.createSourceFile(
            template.target,
            output,
            ts.ScriptTarget.Latest,
            true,
            ts.ScriptKind.TSX
          );
          const identifiers = new Set<string>();
          const visit = (node: ts.Node) => {
            if (ts.isIdentifier(node)) {
              identifiers.add(node.text);
            }
            ts.forEachChild(node, visit);
          };
          visit(parsed);
          for (const [slot, property] of Object.entries({
            account: "AccountSlot",
            businessUnit: "BusinessUnitSwitcher",
            cart: "CartSlot",
            commerce: "Selected_commerce",
            mobileSearch: "Selected_mobileSearch",
            search: "headerSearch",
          })) {
            expect({ mask, present: identifiers.has(property), slot }).toEqual({
              mask,
              present: selected.some((binding) => binding.slot === slot),
              slot,
            });
          }
          expect(output).not.toMatch(/\/\*\{%|\{\/\*\{\{/u);
        }
      }).pipe(Effect.provide(runtime))
  );
});
