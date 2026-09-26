import { Console, Effect, Option, Path, Stdio } from "effect";
import { Argument, Command, Flag, Prompt } from "effect/unstable/cli";

import { InvalidComposition } from "./errors.ts";
import type { SelectionRequest } from "./model.ts";
import { Workspaces } from "./workspaces.ts";

const slots = ["auth", "cms", "commerce"] as const;
const choices = {
  auth: [
    { title: "WorkOS", value: "workos" },
    { title: "Clerk", value: "clerk" },
  ],
  cms: [
    { title: "Drupal", value: "drupal" },
    { title: "Contentstack", value: "contentstack" },
  ],
  commerce: [{ title: "Commercetools", value: "commercetools" }],
};

export const createCommand = (cwd: string) =>
  Command.make(
    "create-next-hydra",
    {
      addOns: Flag.String("add-on").pipe(Flag.atLeast(0)),
      auth: Flag.String("auth").pipe(Flag.optional),
      cms: Flag.String("cms").pipe(Flag.optional),
      commerce: Flag.String("commerce").pipe(Flag.optional),
      commit: Flag.Boolean("commit").pipe(Flag.withDefault(true)),
      directory: Argument.String("project-directory").pipe(Argument.optional),
      preset: Flag.String("preset").pipe(Flag.optional),
      ref: Flag.String("ref").pipe(Flag.optional),
      repository: Flag.String("repo-url").pipe(
        Flag.withDefault("https://github.com/jakala-na/next-hydra.git")
      ),
      skipGit: Flag.Boolean("skip-git").pipe(Flag.withDefault(false)),
      verbose: Flag.Boolean("verbose").pipe(Flag.withDefault(false)),
      without: Flag.Literals("without", slots).pipe(Flag.atLeast(0)),
      yes: Flag.Boolean("yes").pipe(
        Flag.withAlias("y"),
        Flag.withDefault(false)
      ),
    },
    (options) =>
      Effect.gen(function* () {
        const path = yield* Path.Path;
        const stdio = yield* Stdio.Stdio;
        const interactive =
          !options.yes &&
          (yield* stdio.stdinIsTerminal) &&
          (yield* stdio.stdoutIsTerminal);
        let directory = Option.getOrUndefined(options.directory)?.trim();
        if (!directory) {
          if (!interactive) {
            return yield* new InvalidComposition({
              message:
                "Provide a project directory for noninteractive creation.",
            });
          }
          directory = yield* Prompt.String({
            message: "Where should the project be created?",
            validate: (value) =>
              value.trim()
                ? Effect.succeed(value.trim())
                : Effect.fail("Enter a directory."),
          });
        }
        const selected = {
          auth: Option.getOrUndefined(options.auth),
          cms: Option.getOrUndefined(options.cms),
          commerce: Option.getOrUndefined(options.commerce),
        };
        if (
          slots.some(
            (slot) =>
              options.without.includes(slot) && selected[slot] !== undefined
          )
        ) {
          return yield* new InvalidComposition({
            message:
              "A provider slot cannot be selected and excluded together.",
          });
        }
        let selection: SelectionRequest;
        if (Option.isSome(options.preset)) {
          if (options.without.length || slots.some((slot) => selected[slot])) {
            return yield* new InvalidComposition({
              message:
                "--preset cannot be combined with provider or --without flags.",
            });
          }
          selection = { addOns: options.addOns, preset: options.preset.value };
        } else {
          const providers: Partial<Record<(typeof slots)[number], string>> = {};
          for (const slot of slots) {
            if (options.without.includes(slot)) {
              continue;
            }
            const explicit = selected[slot];
            if (!explicit && !interactive) {
              return yield* new InvalidComposition({
                message:
                  "Select every provider slot or leave it empty with --without, or use --preset.",
              });
            }
            providers[slot] =
              explicit ??
              (yield* Prompt.Select({
                choices: choices[slot],
                message: `Choose the ${slot} provider`,
              }));
          }
          selection = { addOns: options.addOns, providers };
        }
        const destination = path.resolve(cwd, directory);
        // Git treats a colon before the first slash as remote syntax (URLs or scp).
        const repository =
          path.isAbsolute(options.repository) ||
          /^[^/]+:/u.test(options.repository)
            ? options.repository
            : path.resolve(cwd, options.repository);
        const workspace = yield* (yield* Workspaces).fresh({
          destination,
          name: path.basename(destination),
          selection,
          source: {
            kind: "repository",
            ref: Option.getOrUndefined(options.ref),
            repository,
          },
        });
        if (options.verbose) {
          yield* Console.log(
            "Acquiring the requested source revision, composing files, then installing dependencies."
          );
        }
        let git: "skip" | "commit" | "initialize" = "initialize";
        if (options.skipGit) {
          git = "skip";
        } else if (options.commit) {
          git = "commit";
        }
        const result = yield* workspace.materialize({ git });
        if (result.git?.warning) {
          yield* Console.warn(result.git.warning);
        }
        for (const instruction of result.instructions) {
          yield* Console.log(`${instruction.item}:\n${instruction.text}`);
        }
        yield* Console.log(
          `Created ${result.destination}. Dependencies ${result.dependencies}. Run pnpm dev from the project directory.`
        );
      })
  ).pipe(Command.withDescription("Compose an application from the registry."));
