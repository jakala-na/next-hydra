import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import ts from "typescript";

import {
  ALGOLIA_CONNECTOR_CURRENCIES,
  ALGOLIA_CONNECTOR_LOCALES,
} from "../connector/commercetools/generated-product";

const forbiddenPatterns: readonly [RegExp, string][] = [
  [/\bimport\b/u, "imports"],
  [/\bexport\b/u, "exports"],
  [/\bsatisfies\b/u, "satisfies expressions"],
  [/^\s*(?:interface|type|declare)\s+/mu, "type declarations"],
];

const transformFunctionPattern = /\basync function transform\s*\(/u;

const generatedProductBindings = `const ALGOLIA_CONNECTOR_CURRENCIES = ${JSON.stringify(ALGOLIA_CONNECTOR_CURRENCIES)};\nconst ALGOLIA_CONNECTOR_LOCALES = ${JSON.stringify(ALGOLIA_CONNECTOR_LOCALES)};\n`;

const runtimeSource = (source: string, fileName: string): string => {
  const sourceFile = ts.createSourceFile(
    fileName,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS
  );
  const statements = sourceFile.statements.filter(
    (statement) =>
      !ts.isImportDeclaration(statement) &&
      !ts.isTypeAliasDeclaration(statement) &&
      !ts.isInterfaceDeclaration(statement) &&
      !(
        ts.isVariableStatement(statement) &&
        statement.modifiers?.some(
          (modifier) => modifier.kind === ts.SyntaxKind.DeclareKeyword
        )
      )
  );
  return ts
    .createPrinter()
    .printFile(ts.factory.updateSourceFile(sourceFile, statements));
};

export const buildAlgoliaCommercetoolsTransformationSource = (
  source: string,
  fileName = "transform.ts"
): string => {
  const transpiled = ts.transpileModule(runtimeSource(source, fileName), {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      removeComments: true,
      target: ts.ScriptTarget.ES2022,
    },
    fileName,
  }).outputText;
  const generated = `${generatedProductBindings}${transpiled.replaceAll(
    /^export\s+(?=(?:async\s+)?function|const|let|var|class)/gmu,
    ""
  )}`;
  for (const [pattern, label] of forbiddenPatterns) {
    if (pattern.test(generated)) {
      throw new Error(
        `Generated Algolia commercetools transformation contains ${label}`
      );
    }
  }
  if (!transformFunctionPattern.test(generated)) {
    throw new Error(
      "Generated Algolia commercetools transformation has no transform function"
    );
  }
  return generated;
};

export const generateAlgoliaCommercetoolsTransformation = async (options: {
  readonly outputFile: string;
  readonly sourceFile: string;
}): Promise<void> => {
  const source = await readFile(options.sourceFile, "utf-8");
  const transformation = buildAlgoliaCommercetoolsTransformationSource(
    source,
    options.sourceFile
  );
  const generated = `// This file is generated. Do not edit it manually.\n// Run \`pnpm cli search types generate\` to regenerate.\n/* oxlint-disable eslint/no-template-curly-in-string -- The generated source intentionally preserves template literals inside this string. */\n\nexport const ALGOLIA_COMMERCETOOLS_TRANSFORMATION_SOURCE = ${JSON.stringify(transformation)};\n`;
  await mkdir(path.dirname(options.outputFile), { recursive: true });
  await writeFile(options.outputFile, generated, "utf-8");
};
