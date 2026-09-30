// PROTOTYPE: syntax inspection, not typechecking or application execution.
import assert from "node:assert/strict";
import ts from "typescript";

export function parse(source, name = "layout.tsx") {
  const tree = ts.createSourceFile(
    name,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX
  );
  assert.equal(
    tree.parseDiagnostics.length,
    0,
    tree.parseDiagnostics
      .map((diagnostic) => {
        const { line, character } = tree.getLineAndCharacterOfPosition(
          diagnostic.start
        );
        return `${name}:${line + 1}:${character + 1}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`;
      })
      .join("\n")
  );
  return tree;
}

// Only literal JSX prop spreads are normalized. Values and their order survive.
export function shape(node) {
  if (ts.isJsxText(node) && /^\s*$/u.test(node.text)) return undefined;
  if (
    ts.isParenthesizedExpression(node) &&
    (ts.isJsxElement(node.expression) ||
      ts.isJsxSelfClosingElement(node.expression))
  ) {
    return shape(node.expression);
  }
  if (ts.isJsxAttributes(node)) {
    return [
      "JsxAttributes",
      ...node.properties.flatMap((attribute) => {
        if (!ts.isJsxSpreadAttribute(attribute)) return [shape(attribute)];
        assert(
          ts.isObjectLiteralExpression(attribute.expression),
          "Only literal prop spreads are comparable"
        );
        return attribute.expression.properties.map((property) => {
          assert(
            ts.isPropertyAssignment(property) && ts.isIdentifier(property.name)
          );
          return [
            "JsxAttribute",
            shape(property.name),
            ["JsxExpression", shape(property.initializer)],
          ];
        });
      }),
    ];
  }
  const children = [];
  ts.forEachChild(node, (child) => {
    const result = shape(child);
    if (result !== undefined) children.push(result);
  });
  const literal =
    ts.isIdentifier(node) || ts.isLiteralExpression(node) || ts.isJsxText(node);
  return [
    ts.SyntaxKind[node.kind],
    ...(literal ? [node.text] : []),
    ...(typeof node.operator === "number" ? [node.operator] : []),
    ...(typeof node.isTypeOnly === "boolean" ? [node.isTypeOnly] : []),
    ...(ts.isVariableDeclarationList(node)
      ? [node.flags & (ts.NodeFlags.Const | ts.NodeFlags.Let)]
      : []),
    ...children,
  ];
}
