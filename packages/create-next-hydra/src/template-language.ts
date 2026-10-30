import { Schema } from "effect";
import { Liquid, Output, Tag, TypeGuards, Value, Variable } from "liquidjs";
import type { Template as LiquidTemplate } from "liquidjs";
import ts from "typescript";

import type { Template } from "./templates.ts";

const engine = new Liquid({
  lenientIf: false,
  outputDelimiterLeft: "{/*{{",
  outputDelimiterRight: "}}*/}",
  strictFilters: true,
  strictVariables: true,
  tagDelimiterLeft: "/*{%",
  tagDelimiterRight: "%}*/",
});
const supportedTags = new Set(["if", "unless", "echo"]);

export interface TemplateContext {
  readonly enabled: Record<string, boolean>;
  readonly imports: string;
  readonly slots: Record<string, string | Record<string, string>>;
}

function matchesPath(variable: Variable, path: readonly string[]): boolean {
  return (
    variable.segments.length === path.length &&
    variable.segments.every((segment, index) => segment === path[index])
  );
}

/** Parse native source and validate every Liquid reference, including skipped branches. */
export function parseTemplate(template: Template, source: string) {
  const diagnostics =
    ts.transpileModule(source, {
      compilerOptions: {
        jsx: ts.JsxEmit.Preserve,
        module: ts.ModuleKind.ESNext,
        target: ts.ScriptTarget.Latest,
      },
      fileName: template.source,
      reportDiagnostics: true,
    }).diagnostics ?? [];
  if (diagnostics.length > 0) {
    throw new Error(
      ts.formatDiagnostics(diagnostics, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => process.cwd(),
        getNewLine: () => "\n",
      })
    );
  }
  const paths: string[][] = [["imports"]];
  const required: string[][] = [["imports"]];
  for (const [slot, kind] of Object.entries(template.slots)) {
    paths.push(["enabled", slot]);
    let outputs = [["slots", slot]];
    if (kind === "wrapper" || kind === "call") {
      outputs = [
        ["slots", slot, "open"],
        ["slots", slot, "close"],
      ];
    } else if (kind === "graphql") {
      outputs = [
        ["slots", slot, "spreads"],
        ["slots", slot, "documents"],
      ];
    }
    for (const output of outputs) {
      paths.push(output);
      required.push(output);
    }
  }
  const parsed = engine.parse(source, template.source);
  const outputs: LiquidTemplate[] = [];
  const pending = [...parsed];
  while (pending.length > 0) {
    const node = pending.pop();
    if (!node) {
      break;
    }
    const children = node.children?.(false, true).next();
    if (node instanceof Tag && !supportedTags.has(node.name)) {
      throw new Error(
        `${template.source}: unsupported template tag: ${node.name}`
      );
    }
    if (
      node instanceof Output ||
      (node instanceof Tag && node.name === "echo")
    ) {
      outputs.push(node);
    }
    if (children) {
      if (!children.done) {
        throw new Error(`${template.source}: asynchronous template analysis`);
      }
      pending.push(...children.value);
    }
  }
  const analysis = engine.analyzeSync(parsed, { partials: false });
  for (const variable of Object.values(analysis.globals).flat()) {
    const location = `${template.source}:${variable.location.row}:${variable.location.col}`;
    if (
      variable.segments.some(
        (segment) => segment instanceof Variable || Number.isInteger(segment)
      )
    ) {
      throw new Error(
        `${location}: dynamic template paths are not supported: ${String(variable)}`
      );
    }
    if (!paths.some((path) => matchesPath(variable, path))) {
      throw new Error(
        `${location}: unknown template variable: ${String(variable)}`
      );
    }
  }
  // Analyze the primary output path separately: filter arguments only reference slots.
  const emitted = outputs.flatMap((node) => {
    const value = [...(node.arguments?.() ?? [])].find(
      (argument) => argument instanceof Value
    );
    const initial = value?.initial.postfix[0];
    if (
      value?.initial.postfix.length !== 1 ||
      !initial ||
      !TypeGuards.isPropertyAccessToken(initial)
    ) {
      return [];
    }
    return Object.values(
      engine.analyzeSync(
        [
          {
            arguments: () => [initial],
            render: () => "",
            token: node.token,
          },
        ],
        { partials: false }
      ).globals
    ).flat();
  });
  for (const path of required) {
    if (emitted.filter((output) => matchesPath(output, path)).length !== 1) {
      throw new Error(
        `${template.source} must emit exactly one ${path.join(".")}`
      );
    }
  }
  return parsed;
}

export function renderParsedTemplate(
  parsed: LiquidTemplate[],
  context: TemplateContext
): string {
  const content = Schema.decodeUnknownSync(Schema.String)(
    engine.renderSync(parsed, context)
  );
  if (/\/\*\{%|\{\/\*\{\{|\{\{[^}]+\}\}/u.test(content)) {
    throw new Error("Unconsumed template directive in rendered source");
  }
  return content;
}
