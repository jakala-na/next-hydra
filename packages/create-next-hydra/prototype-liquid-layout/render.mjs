// PROTOTYPE: layout-only data preparation; LiquidJS owns parsing and control flow.
import { Liquid } from "liquidjs";

const engine = new Liquid({
  tagDelimiterLeft: "/*{%",
  tagDelimiterRight: "%}*/",
  outputDelimiterLeft: "{/*{{",
  outputDelimiterRight: "}}*/}",
  strictVariables: true,
  strictFilters: true,
});

export function contextFor(slots, orderedBindings) {
  const context = { enabled: {}, elements: {}, wrappers: {}, imports: "" };
  context.imports = orderedBindings
    .map(
      (binding) =>
        `import { ${binding.export}${binding.as ? ` as ${binding.as}` : ""} } from ${JSON.stringify(binding.module)};`
    )
    .join("\n");
  for (const [slot, kind] of Object.entries(slots)) {
    const names = orderedBindings
      .filter((binding) => binding.slot === slot)
      .map((binding) => binding.as ?? binding.export);
    context.enabled[slot] = names.length > 0;
    if (kind === "wrapper") {
      context.wrappers[slot] = {
        open: names.map((name) => `<${name}>`).join(""),
        close: names
          .toReversed()
          .map((name) => `</${name}>`)
          .join(""),
      };
    } else {
      context.elements[slot] = names.map((name) => `<${name} />`).join("");
    }
  }
  return context;
}

export function renderLayout(source, context) {
  return engine.parseAndRenderSync(source, context);
}
