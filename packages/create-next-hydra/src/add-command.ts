import { Console, Effect, Stdio } from "effect";
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli";

import { AdditionConflict } from "./addition.ts";
import { InvalidComposition } from "./errors.ts";
import { Workspaces } from "./workspaces.ts";

export const addCommand = (cwd: string) =>
  Command.make(
    "add",
    {
      overwrite: Flag.Boolean("overwrite").pipe(
        Flag.withAlias("o"),
        Flag.withDefault(false),
        Flag.withDescription("Replace changed files and package entries.")
      ),
      reference: Argument.String("reference").pipe(
        Argument.withDescription(
          "Registry item URL, namespaced reference or local JSON file."
        )
      ),
      yes: Flag.Boolean("yes").pipe(
        Flag.withAlias("y"),
        Flag.withDefault(false),
        Flag.withDescription(
          "Skip confirmation prompts; does not permit replacement."
        )
      ),
    },
    (options) =>
      Effect.gen(function* () {
        const workspace = yield* (yield* Workspaces).existing({ root: cwd });
        const inspection = yield* workspace.inspectAdd({
          reference: options.reference,
        });
        for (const assumption of inspection.assumptions) {
          yield* Console.warn(assumption);
        }
        if (inspection.environment.length) {
          yield* Console.warn(
            `Registry environment defaults may be added by ShadCN: ${inspection.environment.join(", ")}`
          );
        }
        const changes = [
          ...inspection.files.map((file) => ({ ...file, label: file.target })),
          ...inspection.packages.map((entry) => ({
            ...entry,
            label: `${entry.target}: ${entry.section}.${entry.name}`,
          })),
        ];
        for (const change of changes) {
          yield* Console.log(`${change.status}: ${change.label}`);
        }
        const conflicts = changes.filter(
          (change) => change.status === "changed"
        );
        let { overwrite } = options;
        if (options.yes) {
          if (conflicts.length && !overwrite) {
            return yield* new AdditionConflict({
              paths: conflicts.map((change) => change.label),
            });
          }
        } else {
          const stdio = yield* Stdio.Stdio;
          if (
            !(yield* stdio.stdinIsTerminal) ||
            !(yield* stdio.stdoutIsTerminal)
          ) {
            return yield* new InvalidComposition({
              message:
                "Addition requires confirmation. Use --yes for noninteractive installation and --overwrite only to permit replacements.",
            });
          }
          if (!overwrite) {
            for (const conflict of conflicts) {
              if (
                !(yield* Prompt.Confirm({
                  initial: false,
                  message: `Replace ${conflict.label}?`,
                }))
              ) {
                return;
              }
            }
            overwrite = conflicts.length > 0;
          }
          if (
            !(yield* Prompt.Confirm({
              initial: false,
              message: "Install this registry item and its dependencies?",
            }))
          ) {
            return;
          }
        }
        const result = yield* workspace.add({
          expected: inspection.precondition,
          overwrite,
          reference: options.reference,
        });
        yield* Console.log("Registry item installed.");
        for (const instruction of result.instructions) {
          yield* Console.log(`${instruction.item}:\n${instruction.text}`);
        }
      })
  ).pipe(Command.withDescription("Add a registry item to this project."));
