# Issue tracker: Local Markdown

Issues and specs (you may know a spec as a PRD) for this repo live as markdown files in `.scratch/`.

## Conventions

- One feature per directory: `.scratch/<feature-slug>/`
- The spec is `.scratch/<feature-slug>/spec.md`
- Implementation issues are one file per ticket at `.scratch/<feature-slug>/issues/<NN>-<slug>.md`, numbered from `01` — never a single combined tickets file
- Triage state is recorded as a `Status:` line near the top of each issue file (see `triage-labels.md` for the role strings)
- Comments and conversation history append to the bottom of the file under a `## Comments` heading

## Research artifacts

Ad hoc research is local working material, not part of the issue tracker. Write it under the repository-root `.scratch/research/` directory, which is explicitly gitignored. Do not stage it, commit it, link to it from tracked files, or create standalone research notes directly under `.scratch/`.

Research may instead be retained under `.scratch/<effort>/research/` only when all of the following are true:

- it resolves a claimed Wayfinder child ticket;
- the detailed artifact needs to be shared or revisited beyond the ticket's `## Answer` summary; and
- the ticket or map links to that artifact as durable evidence.

Name retained research after its ticket, for example `.scratch/<effort>/research/02-provider-api-constraints.md`. The root-only ignore rule does not ignore these effort-local research directories.

If a Wayfinder ticket does not need a separate durable artifact, put the conclusion and source links directly in its `## Answer` and do not create another tracked file.

## When a skill says "publish to the issue tracker"

Create a new file under `.scratch/<feature-slug>/` (creating the directory if needed).

## When a skill says "fetch the relevant ticket"

Read the file at the referenced path. The user will normally pass the path or the issue number directly.

## Wayfinding operations

Used by `/wayfinder`. The **map** is a file with one **child** file per ticket.

- **Map**: `.scratch/<effort>/map.md` — the Notes / Decisions-so-far / Fog body.
- **Child ticket**: `.scratch/<effort>/issues/NN-<slug>.md`, numbered from `01`, with the question in the body. A `Type:` line records the ticket type (`research`/`prototype`/`grilling`/`task`); a `Status:` line records `claimed`/`resolved`.
- **Blocking**: a `Blocked by: NN, NN` line near the top. A ticket is unblocked when every file it lists is `resolved`.
- **Frontier**: scan `.scratch/<effort>/issues/` for files that are open, unblocked, and unclaimed; first by number wins.
- **Claim**: set `Status: claimed` and save before any work.
- **Resolve**: append the answer under an `## Answer` heading, set `Status: resolved`, then append a context pointer (gist + link) to the map's Decisions-so-far in `map.md`.
