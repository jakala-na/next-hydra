/*!
 * Subscription lifecycle adapted from Effect's Parcel watcher:
 * https://github.com/Effect-TS/effect/blob/d5e25b237f05670ee42b386cb40b2cb448fc11d7/packages/platform-node-shared/src/internal/fileSystem/parcelWatcher.ts
 *
 * MIT License
 *
 * Copyright (c) 2023 Effectful Technologies Inc
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
 * SOFTWARE.
 */

import {
  Array as EffectArray,
  Cause,
  Context,
  Effect,
  Equivalence,
  FileSystem,
  Layer,
  Order,
  Path,
  Queue,
  Redacted,
  RegExp as EffectRegExp,
  Schema,
  ScopedRef,
  Stream,
} from "effect";
import type { Scope } from "effect";

import type { SourceInputs } from "./model.ts";
import {
  SourceInventory,
  sourceInputMatcher,
  sourceWatchIgnores,
} from "./source-inventory.ts";
import type { SourceControlFiles } from "./source-inventory.ts";

const sameControls = Equivalence.Array(
  Equivalence.Struct({
    directory: Equivalence.String,
    files: Equivalence.Array(Equivalence.String),
  })
);

export interface SourceCoverage {
  readonly root: string;
  readonly files: readonly string[];
  // Null keeps discovery broad while preparation is unresolved.
  readonly inputs: SourceInputs | null;
}

export class SourceWatchFailure extends Schema.TaggedError<SourceWatchFailure>()(
  "SourceWatchFailure",
  {
    diagnostic: Schema.Redacted(Schema.Unknown, { disallowJsonEncode: true }),
    path: Schema.String,
    phase: Schema.Literals(["connect", "observe", "update"]),
  }
) {
  get message() {
    return `Source observation failed during ${this.phase}: ${this.path}`;
  }
}

export interface SourceSubscription {
  readonly invalidations: Stream.Stream<void, SourceWatchFailure>;
  readonly update: (
    coverage: SourceCoverage
  ) => Effect.Effect<void, SourceWatchFailure>;
}

export class SourceChanges extends Context.Service<
  SourceChanges,
  {
    readonly open: (
      coverage: SourceCoverage
    ) => Effect.Effect<SourceSubscription, SourceWatchFailure, Scope.Scope>;
  }
>()("create-next-hydra/SourceChanges") {
  static readonly layer = Layer.effect(
    SourceChanges,
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const fs = yield* FileSystem.FileSystem;
      const inventory = yield* SourceInventory;
      return SourceChanges.of({
        open: Effect.fn("SourceChanges.open")(function* (initial) {
          const root = path.resolve(initial.root);
          const candidates = new Map<string, boolean>();
          const pending = yield* Queue.dropping<undefined, SourceWatchFailure>(
            1
          );
          const failure = (
            phase: SourceWatchFailure["phase"],
            diagnostic: SourceWatchFailure["diagnostic"]
          ) =>
            new SourceWatchFailure({
              diagnostic,
              path: root,
              phase,
            });
          const matcher = (coverage: SourceCoverage) => {
            const files = coverage.files.map((file) =>
              path.resolve(root, file)
            );
            const selected = sourceInputMatcher(coverage.inputs);
            return (file: string) =>
              files.some(
                (exact) =>
                  exact === file || exact.startsWith(`${file}${path.sep}`)
              ) ||
              selected(path.relative(root, file).split(path.sep).join("/"));
          };
          let matches = matcher(initial);
          const outsideInputs = (coverage: SourceCoverage) =>
            (coverage.inputs?.files ?? [])
              .map((file) => path.resolve(root, file))
              .filter((file) => {
                const relative = path.relative(root, file);
                return (
                  relative === ".." ||
                  relative.startsWith(`..${path.sep}`) ||
                  path.isAbsolute(relative)
                );
              });
          let externalFiles = outsideInputs(initial);
          const withAncestors = (
            files: readonly string[],
            directory = root
          ) => {
            const paths = new Set<string>();
            const prefix = directory.endsWith(path.sep)
              ? directory
              : `${directory}${path.sep}`;
            for (const file of files) {
              let absolute = path.resolve(directory, file);
              while (absolute !== directory && absolute.startsWith(prefix)) {
                paths.add(absolute);
                absolute = path.dirname(absolute);
              }
            }
            return paths;
          };
          const capturedPaths = (coverage: SourceCoverage) =>
            withAncestors([
              ...coverage.files,
              ...(coverage.inputs?.files ?? []),
            ]);
          let captured = capturedPaths(initial);
          const visiblePaths = (phase: SourceWatchFailure["phase"]) =>
            inventory.list(root).pipe(
              Effect.map((files) => withAncestors(files)),
              Effect.mapError((error) => failure(phase, Redacted.make(error)))
            );
          let visible = yield* visiblePaths("connect");
          // Load native code only when Watch is consumed, not for one-shot commands.
          const parcel = yield* Effect.tryPromise({
            catch: (error) => failure("connect", Redacted.make(error)),
            try: async () => await import("@parcel/watcher"),
          });
          // Parcel has no cancellation signal. Acquire/release waits for setup
          // before honoring interruption so a late subscription cannot leak.
          const observe = (
            directory: string,
            receive: (file: string) => boolean,
            ignore: string[]
          ) =>
            Effect.acquireRelease(
              Effect.tryPromise({
                catch: (error) => failure("connect", Redacted.make(error)),
                try: async () =>
                  await parcel.subscribe(
                    directory,
                    (error, events) => {
                      if (error) {
                        Queue.failCauseUnsafe(
                          pending,
                          Cause.fail(failure("observe", Redacted.make(error)))
                        );
                        return;
                      }
                      // Do not short-circuit: retain every candidate in the batch.
                      let relevant = false;
                      for (const event of events) {
                        relevant = receive(event.path) || relevant;
                      }
                      if (relevant) {
                        Queue.offerUnsafe(pending, undefined);
                      }
                    },
                    { ignore }
                  ),
              }),
              (subscription) =>
                Effect.promise(async () => {
                  await subscription.unsubscribe();
                })
            );
          yield* observe(
            root,
            (file) => {
              if (!matches(file)) {
                return false;
              }
              // Remember explicit inputs at arrival, before coverage can narrow.
              candidates.set(
                file,
                candidates.get(file) === true || captured.has(file)
              );
              return true;
            },
            sourceWatchIgnores
          );
          const controlPaths = (phase: SourceWatchFailure["phase"]) =>
            Effect.gen(function* () {
              const controls = [
                ...(yield* inventory.controlFiles(root)),
                ...externalFiles.map((file) => ({
                  directory: path.dirname(file),
                  files: [file],
                })),
              ];
              const directories = new Map<string, Set<string>>();
              for (const control of controls) {
                let { directory } = control;
                // A configured ignore file may not have a parent directory yet.
                // Watch its exact ancestor chain, without crawling sibling trees.
                while (!(yield* fs.exists(directory))) {
                  directory = path.dirname(directory);
                }
                const files = directories.get(directory) ?? new Set<string>();
                for (const file of control.files) {
                  files.add(file);
                }
                directories.set(directory, files);
              }
              return EffectArray.sortWith(
                [...directories].map(([directory, files]) => ({
                  directory,
                  files: EffectArray.sort(files, Order.String),
                })),
                (control) => control.directory,
                Order.String
              );
            }).pipe(
              Effect.mapError((error) => failure(phase, Redacted.make(error)))
            );
          let controlsChanged = false;
          const connectControls = (controls: readonly SourceControlFiles[]) =>
            Effect.forEach(
              controls,
              ({ directory, files }) => {
                const paths = withAncestors(files, directory);
                const allowed = [...paths]
                  .map((file) =>
                    EffectRegExp.escape(
                      path.relative(directory, file).split(path.sep).join("/")
                    )
                  )
                  .join("|");
                // Observe exact controls without crawling Git objects or home directories.
                return observe(
                  directory,
                  (file) => {
                    if (!paths.has(file)) {
                      return false;
                    }
                    controlsChanged = true;
                    if (
                      externalFiles.some(
                        (input) =>
                          input === file ||
                          input.startsWith(`${file}${path.sep}`)
                      )
                    ) {
                      candidates.set(file, true);
                    }
                    return true;
                  },
                  [`!(${allowed})`]
                );
              },
              { discard: true }
            ).pipe(Effect.as(controls));
          const controls = yield* ScopedRef.fromAcquire(
            connectControls(yield* controlPaths("connect"))
          );
          const update: SourceSubscription["update"] = (coverage) =>
            Effect.gen(function* () {
              if (path.resolve(coverage.root) !== root) {
                return yield* failure(
                  "update",
                  Redacted.make(
                    "An observation subscription cannot change its source root"
                  )
                );
              }
              // The root remains connected. Callers broaden before preparation
              // and narrow afterward; coverage updates are not source changes.
              matches = matcher(coverage);
              captured = capturedPaths(coverage);
              // Keep last-known external artifacts connected while preparation
              // is broken, so restoring a deleted artifact can repair Watch.
              if (coverage.inputs !== null) {
                const next = outsideInputs(coverage);
                if (
                  !Equivalence.Array(Equivalence.String)(externalFiles, next)
                ) {
                  externalFiles = next;
                  const current = yield* controlPaths("update");
                  yield* ScopedRef.set(controls, connectControls(current));
                }
              }
            });
          const invalidations = Stream.fromQueue(pending).pipe(
            Stream.filterEffect(() =>
              Effect.gen(function* () {
                // Drain before yielding: events arriving during Git inspection
                // stay queued for the next pass. Coalesce paths, not event history.
                const batch = [...candidates];
                candidates.clear();
                if (controlsChanged) {
                  controlsChanged = false;
                  const current = yield* controlPaths("observe");
                  if (!sameControls(current, yield* ScopedRef.get(controls))) {
                    // Acquire the new subscriptions before releasing the old set.
                    yield* ScopedRef.set(controls, connectControls(current));
                  }
                }
                const current = yield* visiblePaths("observe");
                // Any scan can discover a Git change before its native event
                // arrives. Never consume that visibility change without signaling.
                const relevant =
                  batch.some(
                    ([file, explicit]) =>
                      explicit || visible.has(file) || current.has(file)
                  ) ||
                  [...visible].some(
                    (file) => !current.has(file) && matches(file)
                  ) ||
                  [...current].some(
                    (file) => !visible.has(file) && matches(file)
                  );
                visible = current;
                return relevant;
              })
            )
          );
          return { invalidations, update };
        }),
      });
    })
  );
}
