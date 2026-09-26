import {
  Array as EffectArray,
  ByteSize,
  Effect,
  FileSystem,
  Layer,
  Option,
  Order,
  Path,
  PlatformError,
} from "effect";

type Entry = { content?: Uint8Array; mode: number };

const failure = (
  method: string,
  target: string,
  tag: "NotFound" | "AlreadyExists" | "Unknown" = "NotFound"
) =>
  PlatformError.systemError({
    _tag: tag,
    method,
    module: "FileSystem",
    pathOrDescriptor: target,
  });

// Only the filesystem operations exercised by composition are implemented.
// This layer neither mounts Node's filesystem nor models process I/O.
export const memoryFileSystem = (initial: ReadonlyMap<string, Uint8Array>) =>
  Layer.effect(
    FileSystem.FileSystem,
    Effect.gen(function* () {
      const path = yield* Path.Path;
      const entries = new Map<string, Entry>([["/", { mode: 0o755 }]]);
      let nextTemporary = 0;
      const lookup = (method: string, target: string) =>
        Effect.suspend(() => {
          const entry = entries.get(path.resolve(target));
          return entry
            ? Effect.succeed(entry)
            : Effect.fail(failure(method, target));
        });
      const seedDirectory = (directory: string): void => {
        if (entries.has(directory)) {
          return;
        }
        seedDirectory(path.dirname(directory));
        entries.set(directory, { mode: 0o755 });
      };
      for (const [name, content] of initial) {
        const target = path.resolve(name);
        seedDirectory(path.dirname(target));
        entries.set(target, { content: new Uint8Array(content), mode: 0o644 });
      }
      return FileSystem.make({
        ...FileSystem.makeNoop({}),
        access: (target) => lookup("access", target).pipe(Effect.asVoid),
        chmod: (target, mode) =>
          lookup("chmod", target).pipe(
            Effect.flatMap((entry) =>
              Effect.sync(() => {
                entry.mode = mode;
              })
            )
          ),
        makeDirectory: (target, options) =>
          Effect.gen(function* () {
            const absolute = path.resolve(target);
            if (entries.has(absolute)) {
              if (options?.recursive && !entries.get(absolute)?.content) {
                return;
              }
              return yield* failure("makeDirectory", target, "AlreadyExists");
            }
            if (options?.recursive) {
              seedDirectory(path.dirname(absolute));
            }
            const parent = yield* lookup(
              "makeDirectory",
              path.dirname(absolute)
            );
            if (parent.content) {
              return yield* failure("makeDirectory", target);
            }
            entries.set(absolute, { mode: options?.mode ?? 0o755 });
          }),
        makeTempDirectory: (options) =>
          Effect.sync(() => {
            const target = path.join(
              options?.directory ?? "/tmp",
              `${options?.prefix ?? "temporary-"}${nextTemporary}`
            );
            seedDirectory(path.dirname(target));
            nextTemporary += 1;
            entries.set(target, { mode: 0o700 });
            return target;
          }),
        readDirectory: (target) =>
          Effect.gen(function* () {
            const directory = yield* lookup("readDirectory", target);
            if (directory.content) {
              return yield* failure("readDirectory", target);
            }
            const absolute = path.resolve(target);
            return EffectArray.sort(
              [...entries.keys()]
                .filter(
                  (name) => name !== absolute && path.dirname(name) === absolute
                )
                .map((name) => path.basename(name)),
              Order.String
            );
          }),
        readFile: (target) =>
          Effect.gen(function* () {
            const entry = yield* lookup("readFile", target);
            if (!entry.content) {
              return yield* failure("readFile", target);
            }
            return new Uint8Array(entry.content);
          }),
        remove: (target, options) =>
          Effect.gen(function* () {
            const absolute = path.resolve(target);
            if (!entries.has(absolute) && options?.force) {
              return;
            }
            const entry = yield* lookup("remove", absolute);
            if (!entry.content && !options?.recursive) {
              return yield* failure("remove", target, "Unknown");
            }
            const children = [...entries.keys()].filter((name) =>
              name.startsWith(`${absolute}/`)
            );
            if (children.length && !options?.recursive) {
              return yield* Effect.die(new Error("Recursive removal required"));
            }
            for (const child of children) {
              entries.delete(child);
            }
            entries.delete(absolute);
          }),
        rename: (source, destination) =>
          Effect.gen(function* () {
            const entry = yield* lookup("rename", source);
            yield* lookup("rename", path.dirname(destination));
            if (!entry.content) {
              const children = [...entries].filter(([name]) =>
                name.startsWith(`${path.resolve(source)}/`)
              );
              for (const [name, child] of children) {
                entries.set(
                  path.resolve(destination) +
                    name.slice(path.resolve(source).length),
                  child
                );
                entries.delete(name);
              }
            }
            entries.set(path.resolve(destination), entry);
            entries.delete(path.resolve(source));
          }),
        stat: (target) =>
          lookup("stat", target).pipe(
            Effect.map(
              (entry): FileSystem.File.Info => ({
                atime: Option.none(),
                birthtime: Option.none(),
                blksize: Option.none(),
                blocks: Option.none(),
                dev: 0,
                gid: Option.none(),
                ino: Option.none(),
                mode: entry.mode,
                mtime: Option.none(),
                nlink: Option.none(),
                rdev: Option.none(),
                size: ByteSize.bytes(entry.content?.length ?? 0),
                type: entry.content ? "File" : "Directory",
                uid: Option.none(),
              })
            )
          ),
        writeFile: (target, content, options) =>
          Effect.gen(function* () {
            const absolute = path.resolve(target);
            if (options?.flag === "wx" && entries.has(absolute)) {
              return yield* failure("writeFile", target, "AlreadyExists");
            }
            const parent = yield* lookup("writeFile", path.dirname(absolute));
            if (parent.content) {
              return yield* failure("writeFile", target);
            }
            entries.set(absolute, {
              content: new Uint8Array(content),
              mode: entries.get(absolute)?.mode ?? options?.mode ?? 0o644,
            });
          }),
      });
    })
  ).pipe(Layer.provide(Path.layer));
