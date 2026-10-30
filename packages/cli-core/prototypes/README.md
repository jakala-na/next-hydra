# CLI output prototype

Throwaway design exploration: can an operator identify what happened, what remains, and exactly where to act without reading an undifferentiated log? The terminal is the product surface, so this adapts the UI prototype workflow to three terminal layouts rather than adding a route to an application. No provider operations run and no credentials are read or written. Receipts, counts and failure states are fictional fixtures grounded in the existing commands.

Run from the source checkout with its dependencies installed:

```sh
pnpm cli:output-prototype
pnpm cli:output-prototype --scenario search-installed --onboarding
pnpm cli:output-prototype --variant receipt --scenario failure
pnpm cli:output-prototype --variant guided --scenario compose
pnpm cli:output-prototype --scenario search-vercel
pnpm cli:output-prototype --scenario plan --color never --width 52 --instant
```

Direct Node 24 entrypoint, including when pnpm's launcher is unavailable:

```sh
node packages/cli-core/prototypes/output.ts
```

`--help` lists all flags. Available layouts are `journal`, `receipt`, and `guided`. Scenarios cover manual search setup, app installation, Vercel publication, CMS Live Preview setup, composition, partial failure and dry run. `--onboarding` adds a native Effect destination selector after search preflight; choosing Local or Vercel changes the remaining phases and handoff. Pipes and `--instant` use the fixture's destination without asking for input. Simulated failures are visual fixtures; they do not change the prototype's exit status. Actual cancellation exits with the Effect runtime's interruption status.

`pnpm cli:output-preview` generates a local browser comparison and prints its absolute path. The preview is generated from the same renderer, including its ANSI styling, plus a separate live progress sample using Ora's actual frame formatter and frames. The two panels compare execution and completion states; they are not simultaneous output from a run. Use the arrows to change layout and the controls to change scenario, prose width and plain output. Preview links retain `?variant=` and `?scenario=`. Browser controls do not execute the displayed commands or run Effect prompts; the interactive prompt is available in the terminal.

## Proposed visual contract

- **Phase journal:** title and context, numbered durable phase results, outcome, receipt, then ordered next tasks. Recommended default for provisioning.
- **Compact receipt:** less progress decoration and a conventional receipt followed by next actions. Useful for experienced operators and support transcripts.
- **Guided checklist:** completed automation uses checked markers; pending human tasks come first in the completion report, with the receipt below them. Useful when work moves to a provider dashboard.

All layouts preserve blank lines and headings without color. Outcomes say `ACTION REQUIRED`, `STOPPED`, or `DRY RUN`; a successful provisioning API call does not imply content indexing or manual preview setup is finished. Each next task names a location, an action and a verification condition when available. Commands occupy separate intact lines; long commands may scroll horizontally in the preview instead of being broken into unsafe shell snippets. Only prose wraps.

The fixtures use application-root locations for credential files: pnpm executes the actual administration CLI in `apps/cli`, so `--output .env.search.local` resolves to `apps/cli/.env.search.local`. Vercel output offers deployment and direct app installation steps rather than instructing someone to retrieve sensitive keys from Vercel. Composition reports external provisioning separately from materialization.

## Effect-native implementation

The prototype uses the repository's exact `effect` / `@effect/platform-node` `4.0.0-rc.117` public APIs: `Command`, `Flag`, `Prompt`, `Terminal`, `Stdio`, and `NodeServices`. `Terminal.display` writes the rendered report; `Stdio.stdoutIsTerminal` chooses terminal behavior. Node 24's built-in `util.styleText` supplies bold, dim and semantic colors. Ora 8.2 supplies animation, matching the existing commerce dependency. There is no direct Chalk dependency or Chalk usage in the prototype; Ora itself depends on Chalk internally. Color capability is explicit: auto for a TTY, disabled by nonempty `NO_COLOR`, `TERM=dumb`, or `--color never`. The prototype's policy lets those environment overrides win over `--color always`.

Each Ora spinner starts inside `Effect.acquireRelease` in a phase scope. The finalizer stops the spinner, clears its line and restores the cursor before the custom completed-phase renderer writes, or before Effect shows a prompt. `discardStdin: false` keeps input and SIGINT handling with Effect and Node. Cancellation prints no completion receipt. Pipes use durable lines and no cursor rewriting. Animation is disabled in CI and in plain mode. The delays are simulations, not percentages or real work estimates.

Effect's `CliOutput.Formatter` controls help, parser errors and version text; it is not a general phase/report renderer. The current `Prompt.Theme` can later align prompt symbols/colors. It does not by itself style arbitrary command output. See the [published Effect rc.117 source](https://app.unpkg.com/effect@4.0.0-rc.117/files/src/unstable/cli/CliOutput.ts), [Terminal source](https://app.unpkg.com/effect@4.0.0-rc.117/files/src/Terminal.ts), and [Node styleText documentation](https://nodejs.org/download/release/v24.21.0/docs/api/util.html#utilstyletextformat-text-options).

## Proposed adoption after choosing a layout

Keep rendering and provisioning separate. Put a semantic report renderer and an Effect output service in `@repo/cli-core`. The service should accept report sections and wrap an actual operation as a phase, preserving its result, typed error, defect and interruption. Completion is emitted only after the wrapped operation succeeds. Human output may use stdout today; a future JSON mode should reserve stdout for its result and send progress to stderr through `Stdio`.

Start with these existing boundaries:

1. `packages/search-algolia/cli/index.ts`: format the receipt, destination and conditional content-app handoff. Gradually replace prose-only handoffs with structured actions.
2. `packages/search-algolia/cli/provisioning/provision.ts`: wrap the real preflight, index/key configuration and publication boundaries. Do not infer progress from receipt counts.
3. `packages/cms-contentstack/cli/index.ts` and its provisioning workflow: make manual token acquisition a dashboard task before the existing masked Effect prompts. Stop animation while CSDX owns streamed import output and while prompts are active. Give Live Preview a separate final action.
4. `packages/create-next-hydra/src/commands.ts`: format materialization receipts and registry instructions with the same vocabulary. Keep provider-specific instructions owned by their recipes.

Search provisioning now uses the production `@repo/cli-core/command-output` renderer and scoped Ora phases. Contentstack and Drupal author structured tasks beside their search integrations; the search command combines those tasks with actual receipts and deployment steps. The prototype remains a design exploration with simulated operations. Concurrent phase serialization and machine-readable output remain future work. Prototype directories are excluded from baseline package materialization and production typechecking; this prototype has its own `tsconfig.json`.

## Verification performed

All seven scenarios across all three layouts were run directly from canonical source. Forced color and `NO_COLOR` were checked with captured output. A real pseudo-terminal exercised spinner rendering and SIGINT cleanup (exit 130, cleared line, cancellation message, no completion receipt). The prototype and existing CLI-core TypeScript checks passed, and the repository's test-environment script passed. The browser comparison was inspected in colored, narrow and plain modes. These are prototype smoke checks; no application composition, provider provisioning or end-to-end application test was required or run.
