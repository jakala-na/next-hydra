import { Effect, FileSystem, Path } from "effect";
import ts from "typescript";

import { InvalidComposition } from "./errors.ts";
import { executeLintCommand } from "./workspace-command.ts";

/** Generate local provider and route declarations without contacting provider services. */
export const prepareApplicationTypes = Effect.fn(
  "Composition.prepareApplicationTypes"
)(function* (destination: string) {
  const fs = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const canvas = path.join(
    destination,
    "packages/cms-drupal/scripts/generate-canvas-component-registry.mjs"
  );
  if (yield* fs.exists(canvas)) {
    yield* executeLintCommand(
      path.dirname(path.dirname(canvas)),
      process.execPath,
      [canvas]
    );
  }
  const web = path.join(destination, "apps/web");
  const config = path.join(web, "next.config.ts");
  if (yield* fs.exists(config)) {
    yield* Effect.gen(function* () {
      // Next loads its config from the project directory. Isolate typegen so
      // its service-free config and automatic config edits never touch source.
      const temporary = yield* fs.makeTempDirectoryScoped({
        directory: path.dirname(destination),
        prefix: ".typegen-",
      });
      const project = path.join(temporary, "apps/web");
      yield* fs.makeDirectory(project, { recursive: true });
      for (const input of [
        "package.json",
        "tsconfig.json",
        "next-env.d.ts",
        "app",
        "pages",
        "src",
      ]) {
        const source = path.join(web, input);
        if (yield* fs.exists(source)) {
          yield* fs.copy(source, path.join(project, input));
        }
      }
      yield* fs.symlink(
        path.join(web, "node_modules"),
        path.join(project, "node_modules")
      );
      const packages = path.join(destination, "packages");
      if (yield* fs.exists(packages)) {
        yield* fs.symlink(packages, path.join(temporary, "packages"));
      }
      yield* fs.writeFileString(
        path.join(project, "next.config.ts"),
        'export { baseConfig as default } from "@repo/next-config";\n'
      );
      yield* executeLintCommand(
        project,
        path.join(web, "node_modules/.bin/next"),
        ["typegen"]
      );
      yield* fs.makeDirectory(path.join(web, ".next"), { recursive: true });
      yield* fs.copy(
        path.join(project, ".next/types"),
        path.join(web, ".next/types"),
        { overwrite: true }
      );
      const environment = path.join(web, "next-env.d.ts");
      if (!(yield* fs.exists(environment))) {
        yield* fs.writeFile(
          environment,
          yield* fs.readFile(path.join(project, "next-env.d.ts")),
          { flag: "wx" }
        );
      }
    }).pipe(Effect.scoped);
  }
});

export const typecheckApplication = Effect.fn(
  "Composition.typecheckApplication"
)(function* (configFile: string, expectedFiles: readonly string[] = []) {
  const path = yield* Path.Path;
  const diagnostics = yield* Effect.try({
    catch: (error) => new InvalidComposition({ message: String(error) }),
    try: () => {
      const config = ts.readConfigFile(configFile, (file) =>
        ts.sys.readFile(file)
      );
      const parsed = ts.parseJsonConfigFileContent(
        config.config ?? {},
        ts.sys,
        path.dirname(configFile),
        { incremental: false, noCheck: false, noEmit: true },
        configFile
      );
      const errors = [
        ...(config.error ? [config.error] : []),
        ...parsed.errors,
      ];
      const program = ts.createProgram({
        options: parsed.options,
        projectReferences: parsed.projectReferences,
        rootNames: parsed.fileNames,
      });
      const inspected = new Set(
        program.getSourceFiles().map((file) => path.resolve(file.fileName))
      );
      for (const file of expectedFiles) {
        if (!inspected.has(path.resolve(file))) {
          throw new Error(
            `Typecheck did not inspect rendered template: ${file}`
          );
        }
      }
      errors.push(...ts.getPreEmitDiagnostics(program));
      return ts.formatDiagnostics(errors, {
        getCanonicalFileName: (file) => file,
        getCurrentDirectory: () => path.dirname(configFile),
        getNewLine: () => "\n",
      });
    },
  });
  if (diagnostics.length > 0) {
    return yield* new InvalidComposition({
      message: `${configFile}\n${diagnostics}`,
    });
  }
});
