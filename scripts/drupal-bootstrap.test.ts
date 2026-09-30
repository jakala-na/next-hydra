import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, test } from "vitest";

const bootstrap = path.resolve(
  import.meta.dirname,
  "../apps/drupal/scripts/bootstrap_acquia.sh"
);
describe("Drupal hosted bootstrap", () => {
  const temporaryDirectories: string[] = [];

  afterEach(() => {
    for (const directory of temporaryDirectories.splice(0)) {
      rmSync(directory, { force: true, recursive: true });
    }
  });

  // Only the Acquia transport is replaced. The real bootstrap script selects and
  // orders the recipes against files representing the deployed artifact.
  function runBootstrap(files: readonly string[], installed = false) {
    const directory = mkdtempSync(path.join(os.tmpdir(), "drupal-bootstrap-"));
    temporaryDirectories.push(directory);
    for (const file of files) {
      const destination = path.join(directory, file);
      mkdirSync(path.dirname(destination), { recursive: true });
      writeFileSync(destination, "");
    }
    const log = path.join(directory, "commands.log");
    writeFileSync(log, "");
    writeFileSync(
      path.join(directory, "acli"),
      `#!/usr/bin/env bash
set -euo pipefail
printf '%s\\n' "$*" >> "$BOOTSTRAP_LOG"
command="$1"
shift 3
case "$command" in
  remote:ssh)
    if [[ "$1" == "test" ]]; then
      "$@"
    fi
    ;;
  remote:drush)
    if [[ "$1" == "status" && "$BOOTSTRAP_INSTALLED" == "yes" ]]; then
      echo Successful
    fi
    ;;
  *) exit 64 ;;
esac
`,
      { mode: 0o755 }
    );
    const result = spawnSync("bash", [bootstrap, "demo.test"], {
      cwd: directory,
      encoding: "utf-8",
      env: {
        ...process.env,
        BOOTSTRAP_INSTALLED: installed ? "yes" : "no",
        BOOTSTRAP_LOG: log,
        PATH: `${directory}:${process.env.PATH}`,
      },
      input: "demo.test\n",
    });
    const commands = readFileSync(log, "utf-8");
    return { ...result, commands };
  }

  const searchFiles = [
    "recipes/search-algolia/recipe.yml",
    "docroot/modules/contrib/search_api/search_api.info.yml",
    "docroot/modules/contrib/search_api_algolia/search_api_algolia.info.yml",
  ];

  test.each([false, true])(
    "hosted Search applies after the selected site recipe (Commerce: %s)",
    (commerce) => {
      const result = runBootstrap([
        ...searchFiles,
        ...(commerce ? ["recipes/next-hydra-commerce/recipe.yml"] : []),
      ]);
      assert.equal(result.status, 0, result.stderr);
      const recipes = result.commands
        .split("\n")
        .filter((line) => line.includes(" -- recipe "));
      assert.deepEqual(recipes, [
        `remote:drush demo.test -- recipe ../recipes/next-hydra-${commerce ? "commerce" : "base"} --verbose`,
        "remote:drush demo.test -- recipe ../recipes/search-algolia --verbose",
      ]);
    }
  );

  test("CMS without Search bootstraps without Search dependencies or configuration", () => {
    const result = runBootstrap([]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(
      result.commands,
      /-- recipe \.\.\/recipes\/next-hydra-base --verbose/u
    );
    assert.doesNotMatch(
      result.commands,
      /-- recipe \.\.\/recipes\/search-algolia/u
    );
    assert.match(result.commands, /-- site:install minimal/u);
  });

  test.each(searchFiles.slice(1))(
    "missing %s stops before database installation",
    (missing) => {
      const result = runBootstrap(
        searchFiles.filter((file) => file !== missing)
      );
      assert.equal(result.status, 65, result.stderr);
      assert.match(result.stderr, /Search dependencies are missing/u);
      assert.doesNotMatch(
        result.commands,
        /-- site:install|-- php scripts\/initialize_acquia_secrets/u
      );
    }
  );

  test("an installed site is not reinstalled or given fresh recipe configuration", () => {
    const result = runBootstrap(searchFiles, true);
    assert.equal(result.status, 65, result.stderr);
    assert.doesNotMatch(result.commands, /-- site:install|-- recipe /u);
  });
});
