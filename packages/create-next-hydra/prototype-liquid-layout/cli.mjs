// THROWAWAY: execute the layout experiment, or toggle slots interactively.
import assert from "node:assert/strict";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { createInterface } from "node:readline/promises";
import { Effect } from "effect";
import { format } from "oxfmt";
import { contextFor, renderLayout } from "./render.mjs";
import { parse, shape } from "./inspect.mjs";

const here = new URL("./", import.meta.url);
const root = new URL("../../../", here);
const read = async (path) => readFile(new URL(path, root), "utf8");
const json = async (path) => JSON.parse(await read(path));
const registries = await Promise.all([
  json("apps/web/registry.json"),
  json("packages/commerce/registry.json"),
]);
const items = registries.flatMap((registry) => registry.items);
const template = items
  .flatMap((item) => item.meta?.composition?.templates ?? [])
  .find((item) => item.target === "apps/web/app/[locale]/layout.tsx");
const bindings = items.flatMap((item) =>
  (item.meta?.composition?.slotBindings ?? [])
    .filter((binding) => binding.target === template.target)
    .map((binding) => ({ ...binding, owner: item.name }))
);
const slotNames = Object.keys(template.slots);
const source = await readFile(new URL("layout.prototype.tsx", here), "utf8");
const originalSource = await read(template.source);
await mkdir(new URL(".cache/", here), { recursive: true });
await mkdir(new URL("output/", here), { recursive: true });
// These files are byte-for-byte copies, so the baseline is the actual renderer.
for (const name of ["templates.ts", "errors.ts", "files.ts"]) {
  await copyFile(
    new URL(`../src/${name}`, here),
    new URL(`.cache/${name}`, here)
  );
}
const { renderTemplate, orderBindings } = await import("./.cache/templates.ts");
const options = {
  printWidth: 80,
  sortImports: { ignoreCase: true, newlinesBetween: true, order: "asc" },
  trailingComma: "es5",
};

async function verify(name, selected, input = source) {
  parse(input, "layout.prototype.tsx");
  const context = contextFor(template.slots, orderBindings(selected));
  const raw = renderLayout(input, context);
  assert(!/\/\*\{[%{]/u.test(raw), "Unconsumed Liquid directive remains");
  parse(raw, `${name}.raw.tsx`);
  const formatted = await format(template.target, raw, options);
  assert.equal(formatted.errors.length, 0, JSON.stringify(formatted.errors));
  const reference = await Effect.runPromise(
    renderTemplate(template, selected, originalSource)
  );
  assert.deepEqual(
    shape(parse(formatted.code)),
    shape(parse(reference)),
    `${name}: rendered layout differs`
  );
  return { context, code: formatted.code, reference };
}

async function matrix() {
  let checked = 0;
  for (let mask = 0; mask < 2 ** slotNames.length; mask++) {
    const active = slotNames.filter((_, index) => mask & (1 << index));
    const result = await verify(
      active.join("+") || "none",
      bindings.filter((binding) => active.includes(binding.slot))
    );
    checked++;
    if (mask === 0 || mask === 2 ** slotNames.length - 1) {
      const name = mask === 0 ? "none" : "all";
      await writeFile(new URL(`output/${name}.tsx`, here), result.code);
      await writeFile(
        new URL(`output/${name}.reference.tsx`, here),
        result.reference
      );
    }
  }
  const aliased = bindings
    .map((binding) => ({ ...binding, as: `Selected${binding.export}` }))
    .toReversed();
  await verify("aliased-reversed-input", aliased);
  const nested = [
    ...bindings,
    {
      ...bindings.find((binding) => binding.slot === "commerce"),
      export: "OuterProvider",
      as: "OuterCommerce",
      module: "@prototype/outer&provider",
      owner: "prototype-outer",
      order: -10,
    },
  ].toReversed();
  const nestedResult = await verify("nested-wrappers", nested);
  await writeFile(new URL("output/nested.tsx", here), nestedResult.code);
  const context = contextFor(template.slots, orderBindings(bindings));
  const missing = structuredClone(context);
  delete missing.enabled.search;
  assert.throws(() => renderLayout(source, missing), /undefined variable/u);
  assert.throws(
    () => renderLayout(source.replace("endif", "endiff"), context),
    /tag.*not found|unknown tag/u
  );
  const authorFormatted = await format("layout.prototype.tsx", source, options);
  assert.equal(
    authorFormatted.errors.length,
    0,
    JSON.stringify(authorFormatted.errors)
  );
  await writeFile(
    new URL("output/layout.formatted-template.tsx", here),
    authorFormatted.code
  );
  let formatterRoundTrip;
  try {
    await verify("formatter-round-trip", bindings, authorFormatted.code);
    formatterRoundTrip = "PASS";
  } catch (error) {
    formatterRoundTrip = `FAIL: ${error.message.split("\n")[0]}`;
  }
  const report = {
    question:
      "Can LiquidJS render the real layout in one pass from syntactically valid TSX?",
    unrenderedTsx: "PASS",
    combinations: checked,
    renderedTsxAndNormalizedStructure: "PASS",
    aliasedReorderedBindings: "PASS",
    nestedWrappersAndUnescapedSource: "PASS",
    missingVariableAndMalformedTag: "PASS (rejected)",
    formatterRoundTrip,
    scope:
      "Parser and renderer experiment; no application typecheck or browser execution",
  };
  await writeFile(
    new URL("output/report.json", here),
    `${JSON.stringify(report, null, 2)}\n`
  );
  console.log(JSON.stringify(report, null, 2));
}

if (process.argv.includes("--all") || !process.stdin.isTTY) {
  await matrix();
} else {
  const input = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const active = new Set(slotNames);
  while (true) {
    const result = await verify(
      "interactive",
      bindings.filter((binding) => active.has(binding.slot))
    );
    await writeFile(new URL("output/current.tsx", here), result.code);
    console.clear();
    console.log("\x1b[1mLiquidJS layout — throwaway prototype\x1b[0m");
    console.log(JSON.stringify(result.context, null, 2));
    console.log(
      "\nTSX syntax + normalized structure against current renderer: PASS"
    );
    console.log(
      `Output: ${fileURLToPath(new URL("output/current.tsx", here))}`
    );
    console.log(
      slotNames.map((name, index) => `[${index + 1}] ${name}`).join("  ")
    );
    const key = (
      await input.question("[a] verify all combinations  [q] quit > ")
    ).trim();
    if (key === "q") break;
    if (key === "a") {
      await matrix();
      await input.question("Enter to continue > ");
    }
    const slot = slotNames[Number(key) - 1];
    if (slot) active.has(slot) ? active.delete(slot) : active.add(slot);
  }
  input.close();
}
