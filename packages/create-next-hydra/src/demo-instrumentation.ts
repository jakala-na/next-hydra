import { Array as EffectArray, Effect, Order } from "effect";
import ts from "typescript";

import { InvalidComposition } from "./errors.ts";

export const demoArchitecturePackage = "@repo/demo-architecture";

function isDemoModule(value: string): boolean {
  return (
    value === demoArchitecturePackage ||
    value.startsWith(`${demoArchitecturePackage}/`)
  );
}

function importKind(moduleName: string): "boundary" | "toolbar" | undefined {
  if (moduleName === `${demoArchitecturePackage}/boundary`) {
    return "boundary";
  }
  if (moduleName === `${demoArchitecturePackage}/toolbar`) {
    return "toolbar";
  }
  return undefined;
}

interface Edit {
  readonly start: number;
  readonly end: number;
  readonly text: string;
}

const metadataProps = new Set([
  "caching",
  "cacheTags",
  "composition",
  "description",
  "getCacheTags",
  "name",
  "streaming",
]);

// Values describe the demo, never drive application work. Suppliers are lazy:
// their bodies run only in the demo runtime, so erasing them has no side effects.
function isMetadataValue(node: ts.Expression): boolean {
  if (
    ts.isIdentifier(node) ||
    ts.isLiteralExpression(node) ||
    ts.isArrowFunction(node) ||
    node.kind === ts.SyntaxKind.TrueKeyword ||
    node.kind === ts.SyntaxKind.FalseKeyword ||
    node.kind === ts.SyntaxKind.NullKeyword
  ) {
    return true;
  }
  if (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isNonNullExpression(node)
  ) {
    return isMetadataValue(node.expression);
  }
  if (ts.isPropertyAccessExpression(node)) {
    return isMetadataValue(node.expression);
  }
  if (ts.isArrayLiteralExpression(node)) {
    return node.elements.every(isMetadataValue);
  }
  if (ts.isConditionalExpression(node)) {
    return (
      isMetadataValue(node.condition) &&
      isMetadataValue(node.whenTrue) &&
      isMetadataValue(node.whenFalse)
    );
  }
  return false;
}

function validateMetadata(attributes: ts.JsxAttributes): void {
  for (const property of attributes.properties) {
    if (
      !ts.isJsxAttribute(property) ||
      !ts.isIdentifier(property.name) ||
      !metadataProps.has(property.name.text)
    ) {
      throw new Error(
        "Only demo metadata props can be erased; move keys, refs, layout and spread props onto application elements."
      );
    }
    const value = property.initializer;
    if (
      value &&
      !ts.isStringLiteral(value) &&
      (!ts.isJsxExpression(value) ||
        !value.expression ||
        !isMetadataValue(value.expression))
    ) {
      throw new Error(
        "Metadata must be a value or lazy supplier, not an eager operation."
      );
    }
  }
}

// Only the explicit demo import contract is erasable. This is not dead-code
// elimination, and must never remove application cache or Suspense boundaries.
export const eraseDemoInstrumentation = (target: string, source: string) =>
  Effect.try({
    catch: (error) =>
      new InvalidComposition({
        message: `Cannot remove demo instrumentation from ${target}: ${error instanceof Error ? error.message : String(error)}`,
      }),
    try: () => {
      if (!source.includes(demoArchitecturePackage)) {
        return source;
      }
      const file = ts.createSourceFile(
        target,
        source,
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.TSX
      );
      const diagnostics =
        ts.transpileModule(source, {
          compilerOptions: {
            jsx: ts.JsxEmit.Preserve,
            target: ts.ScriptTarget.ESNext,
          },
          fileName: target,
          reportDiagnostics: true,
        }).diagnostics ?? [];
      if (
        diagnostics.some(
          (diagnostic) => diagnostic.category === ts.DiagnosticCategory.Error
        )
      ) {
        throw new Error("Invalid source syntax.");
      }
      const bindings = new Map<string, "boundary" | "toolbar">();
      const allowed = new Set<ts.Node>();
      const edits: Edit[] = [];
      for (const statement of file.statements) {
        if (
          !ts.isImportDeclaration(statement) ||
          !ts.isStringLiteral(statement.moduleSpecifier)
        ) {
          continue;
        }
        const moduleName = statement.moduleSpecifier.text;
        if (!isDemoModule(moduleName)) {
          continue;
        }
        if (
          moduleName === `${demoArchitecturePackage}/styles.css` &&
          !statement.importClause
        ) {
          allowed.add(statement.moduleSpecifier);
          edits.push({
            end: statement.end,
            start: statement.getStart(file),
            text: "",
          });
          continue;
        }
        const kind = importKind(moduleName);
        const clause = statement.importClause;
        if (
          !kind ||
          !clause ||
          clause.name ||
          clause.phaseModifier === ts.SyntaxKind.TypeKeyword ||
          !clause.namedBindings ||
          !ts.isNamedImports(clause.namedBindings)
        ) {
          throw new Error(
            "Use named imports from the demo boundary or toolbar module."
          );
        }
        for (const element of clause.namedBindings.elements) {
          if (/^[a-z]/u.test(element.name.text)) {
            throw new Error(
              "Demo import aliases must use component names, not lowercase HTML tag names."
            );
          }
          const name =
            kind === "boundary"
              ? "ArchitectureBoundary"
              : "ArchitectureToolbar";
          if (
            (element.propertyName ?? element.name).text !== name ||
            element.isTypeOnly
          ) {
            throw new Error(
              "Demo types and helpers must not enter application interfaces."
            );
          }
          bindings.set(element.name.text, kind);
          allowed.add(element.name);
          if (element.propertyName) {
            allowed.add(element.propertyName);
          }
        }
        allowed.add(statement.moduleSpecifier);
        edits.push({
          end: statement.end,
          start: statement.getStart(file),
          text: "",
        });
      }
      const visit = (
        node: ts.Node,
        inJsxChildren = false,
        canSplice = false
      ): void => {
        if (
          ts.isJsxElement(node) &&
          ts.isIdentifier(node.openingElement.tagName) &&
          bindings.get(node.openingElement.tagName.text) === "boundary"
        ) {
          validateMetadata(node.openingElement.attributes);
          allowed.add(node.openingElement.tagName);
          allowed.add(node.closingElement.tagName);
          const children = node.children.filter(
            (child) =>
              !(
                ts.isJsxText(child) &&
                child.containsOnlyTriviaWhiteSpaces &&
                /[\r\n]/u.test(child.text)
              )
          );
          const child = children.length === 1 ? children[0] : undefined;
          const lastChild = children.at(-1);
          const singleElement =
            child !== undefined &&
            (ts.isJsxElement(child) ||
              ts.isJsxSelfClosingElement(child) ||
              ts.isJsxFragment(child));
          const elementChildren =
            children.length > 0 &&
            children.every(
              (element) =>
                ts.isJsxElement(element) ||
                ts.isJsxSelfClosingElement(element) ||
                ts.isJsxFragment(element)
            );
          // Keep text token boundaries and the single-child contract of custom
          // components. Only element groups under intrinsic parents can flatten.
          const splice =
            inJsxChildren && (singleElement || (canSplice && elementChildren));
          // Parentheses preserve return/newline semantics when a single JSX
          // child becomes an expression. JSX parents accept siblings directly.
          let opening = "<>";
          let closing = "</>";
          if (splice) {
            opening = "";
            closing = "";
          } else if (singleElement && !inJsxChildren) {
            opening = "(";
            closing = ")";
          }
          edits.push(
            {
              end:
                splice && children[0] !== undefined
                  ? children[0].getStart(file)
                  : node.openingElement.end,
              start: node.openingElement.getStart(file),
              text: opening,
            },
            {
              end: node.closingElement.end,
              start:
                splice && lastChild !== undefined
                  ? lastChild.end
                  : node.closingElement.getStart(file),
              text: closing,
            }
          );
          for (const element of node.children) {
            visit(
              element,
              splice || !singleElement,
              splice ? canSplice : !singleElement
            );
          }
          return;
        }
        if (
          ts.isJsxSelfClosingElement(node) &&
          ts.isIdentifier(node.tagName) &&
          bindings.get(node.tagName.text) === "toolbar"
        ) {
          if (node.attributes.properties.length) {
            throw new Error(
              "The demo toolbar must not receive application props."
            );
          }
          allowed.add(node.tagName);
          edits.push({
            end: node.end,
            start: node.getStart(file),
            text: inJsxChildren ? "{null}" : "null",
          });
        }
        ts.forEachChild(node, (child) => {
          const childPosition =
            (ts.isJsxElement(node) || ts.isJsxFragment(node)) &&
            node.children.some((element) => element === child);
          const intrinsicParent =
            ts.isJsxFragment(node) ||
            (ts.isJsxElement(node) &&
              ts.isIdentifier(node.openingElement.tagName) &&
              /^[a-z]/u.test(node.openingElement.tagName.text));
          visit(child, childPosition, childPosition && intrinsicParent);
        });
      };
      visit(file);
      const check = (node: ts.Node): void => {
        if (
          (ts.isStringLiteralLike(node) || ts.isTemplateHead(node)) &&
          isDemoModule(node.text) &&
          !allowed.has(node)
        ) {
          throw new Error(
            "Demo modules must use the supported static imports."
          );
        }
        if (
          ts.isIdentifier(node) &&
          bindings.has(node.text) &&
          !allowed.has(node)
        ) {
          throw new Error(
            `Unsupported use of demo import ${node.text}. Use an explicit JSX boundary.`
          );
        }
        ts.forEachChild(node, check);
      };
      check(file);
      let output = source;
      const descendingPosition = Order.mapInput(
        Order.Number,
        (edit: Edit) => -edit.start
      );
      for (const edit of EffectArray.sort(edits, descendingPosition)) {
        output =
          output.slice(0, edit.start) + edit.text + output.slice(edit.end);
      }
      return output;
    },
  });
