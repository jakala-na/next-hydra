import { NodeServices } from "@effect/platform-node";
import { describe, expect, it } from "@effect/vitest";
import {
  Cause,
  Effect,
  Exit,
  FileSystem,
  Path,
  PlatformError,
  Redacted,
  Schema,
  Sink,
  Stream,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  RuntimeEnvironmentPreflightError,
  RuntimeEnvironmentPublicationError,
  RuntimeEnvironmentPublicationIncomplete,
  RuntimeEnvironmentPublicationOutcomeUnknown,
  RuntimeEnvironmentPublisher,
  RuntimeEnvironmentVariable,
  runtimeEnvironmentManifestFromSchema,
  runtimeEnvironmentPublisherLayer,
} from "./runtime-environment";
import { runtimeEnvironmentDestinationFromFlags } from "./runtime-environment-cli";

interface Invocation {
  readonly args: readonly string[];
  readonly body?: string;
  readonly command: string;
}

interface Response {
  readonly collectionFailure?: boolean;
  readonly exitCode?: number;
  readonly spawnFailure?: boolean;
  readonly stderr?: string;
  readonly stdout?: string;
}

const encodeJson = Schema.encodeSync(Schema.fromJsonString(Schema.Unknown));
const decodeJson = Schema.decodeUnknownSync(
  Schema.fromJsonString(Schema.Unknown)
);

const fakeSpawner = (
  responses: readonly Response[],
  invocations: Invocation[]
) => {
  let responseIndex = 0;
  return ChildProcessSpawner.make(
    Effect.fnUntraced(function* (command) {
      if (!ChildProcess.isStandardCommand(command)) {
        return yield* Effect.die("Expected a standard command");
      }
      const { stdin } = command.options;
      const body = Stream.isStream(stdin)
        ? yield* stdin.pipe(Stream.decodeText(), Stream.mkString)
        : undefined;
      invocations.push(
        body === undefined
          ? { args: command.args, command: command.command }
          : { args: command.args, body, command: command.command }
      );
      const response = responses[responseIndex];
      responseIndex += 1;
      if (response === undefined) {
        return yield* Effect.die("Unexpected child process invocation");
      }
      if (response.spawnFailure) {
        return yield* PlatformError.systemError({
          _tag: "Unknown",
          description: "simulated spawn failure",
          method: "spawn",
          module: "ChildProcessSpawner",
        });
      }
      const stdout = new TextEncoder().encode(response.stdout ?? "");
      const stderr = new TextEncoder().encode(response.stderr ?? "");
      return ChildProcessSpawner.makeHandle({
        all: Stream.fromIterable([stdout, stderr]),
        exitCode: response.collectionFailure
          ? PlatformError.systemError({
              _tag: "Unknown",
              description: "simulated result collection failure",
              method: "exitCode",
              module: "ChildProcessSpawner",
            })
          : Effect.succeed(
              ChildProcessSpawner.ExitCode(response.exitCode ?? 0)
            ),
        getInputFd: () => Sink.drain,
        getOutputFd: () => Stream.empty,
        isRunning: Effect.succeed(false),
        kill: () => Effect.void,
        pid: ChildProcessSpawner.ProcessId(123),
        stderr: Stream.fromIterable([stderr]),
        stdin: Sink.drain,
        stdout: Stream.fromIterable([stdout]),
        unref: Effect.succeed(Effect.void),
      });
    })
  );
};

const PublisherLayer = runtimeEnvironmentPublisherLayer;

const withPublisher =
  (spawner: ChildProcessSpawner.ChildProcessSpawner["Service"]) =>
  <A, E, R>(effect: Effect.Effect<A, E, R>) =>
    effect.pipe(
      Effect.provide(PublisherLayer),
      Effect.provideService(ChildProcessSpawner.ChildProcessSpawner, spawner),
      Effect.provide(NodeServices.layer)
    );

const manifest = [
  new RuntimeEnvironmentVariable({
    applications: ["web", "api"],
    key: "PUBLIC_VALUE",
    sensitive: false,
  }),
  new RuntimeEnvironmentVariable({
    applications: ["api"],
    key: "SECRET_VALUE",
    sensitive: true,
  }),
] as const;

const apiManifest = [
  new RuntimeEnvironmentVariable({
    applications: ["api"],
    key: "SECRET_VALUE",
    sensitive: true,
  }),
] as const;

const makeLinkedWorkspace = Effect.gen(function* () {
  const fileSystem = yield* FileSystem.FileSystem;
  const path = yield* Path.Path;
  const workspaceRoot = yield* fileSystem.makeTempDirectoryScoped({
    prefix: "next-hydra-vercel-workspace-",
  });
  yield* Effect.forEach(
    Effect.fnUntraced(function* (application: "api" | "web") {
      const directory = path.join(
        workspaceRoot,
        "apps",
        application,
        ".vercel"
      );
      yield* fileSystem.makeDirectory(directory, { recursive: true });
      yield* fileSystem.writeFileString(
        path.join(directory, "project.json"),
        encodeJson({
          orgId: "team_123",
          projectId: `prj_${application}`,
        })
      );
    })
  )(["web", "api"] as const);
  return workspaceRoot;
});

describe(RuntimeEnvironmentPublisher, () => {
  it("derives Vercel sensitivity from Redacted schema fields", () => {
    expect(
      runtimeEnvironmentManifestFromSchema(
        {
          PLAIN: Schema.String,
          SECRET: Schema.Redacted(Schema.String),
        },
        ["web"]
      )
    ).toMatchObject([
      { applications: ["web"], key: "PLAIN", sensitive: false },
      { applications: ["web"], key: "SECRET", sensitive: true },
    ]);
  });

  it("defaults publication to create-only and keeps overwrite explicit", () => {
    expect(
      runtimeEnvironmentDestinationFromFlags({
        environment: ["production"],
        output: ".env.local",
        overwrite: false,
        store: "vercel",
        yes: true,
      })
    ).toMatchObject({ publicationMode: "create" });
    expect(
      runtimeEnvironmentDestinationFromFlags({
        environment: ["production"],
        output: ".env.local",
        overwrite: true,
        store: "vercel",
        yes: true,
      })
    ).toMatchObject({ publicationMode: "overwrite" });
  });

  it.effect("rejects overwrite for the local file adapter", () => {
    const invocations: Invocation[] = [];
    return Effect.gen(function* () {
      const publisher = yield* RuntimeEnvironmentPublisher;
      const error = yield* publisher
        .prepare({
          destination: {
            destination: "local",
            output: "runtime.env",
            publicationMode: "overwrite",
            yes: true,
          },
          manifest,
        })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(RuntimeEnvironmentPreflightError);
      expect(error.operation).toBe("policy");
      expect(invocations).toStrictEqual([]);
    }).pipe(withPublisher(fakeSpawner([], invocations)));
  });

  it.effect("publishes through the default local file adapter", () => {
    const invocations: Invocation[] = [];
    return Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "next-hydra-runtime-environment-",
        });
        const output = path.join(directory, "runtime.env");
        const publisher = yield* RuntimeEnvironmentPublisher;
        const prepared = yield* publisher.prepare({
          destination: {
            destination: "local",
            output,
            publicationMode: "create",
            yes: true,
          },
          manifest,
        });
        const receipt = yield* publisher.publish(prepared, {
          PUBLIC_VALUE: "public",
          SECRET_VALUE: Redacted.make("secret"),
        });

        expect(receipt).toMatchObject({
          destination: "local",
          mode: 0o600,
          path: output,
        });
        expect(yield* fileSystem.readFileString(output)).toBe(
          'PUBLIC_VALUE="public"\nSECRET_VALUE="secret"\n'
        );
        expect(invocations).toStrictEqual([]);
      }).pipe(withPublisher(fakeSpawner([], invocations)))
    );
  });

  it.effect("treats prepared-manifest value mismatches as defects", () => {
    const invocations: Invocation[] = [];
    return Effect.scoped(
      Effect.gen(function* () {
        const fileSystem = yield* FileSystem.FileSystem;
        const path = yield* Path.Path;
        const directory = yield* fileSystem.makeTempDirectoryScoped({
          prefix: "next-hydra-runtime-environment-",
        });
        const publisher = yield* RuntimeEnvironmentPublisher;
        const prepared = yield* publisher.prepare({
          destination: {
            destination: "local",
            output: path.join(directory, "runtime.env"),
            publicationMode: "create",
            yes: true,
          },
          manifest,
        });
        const exit = yield* publisher
          .publish(prepared, {
            PUBLIC_VALUE: "public",
            SECRET_VALUE: "not-redacted",
          })
          .pipe(Effect.exit);

        expect(Exit.isFailure(exit)).toBeTruthy();
        if (Exit.isFailure(exit)) {
          expect(Cause.hasDies(exit.cause)).toBeTruthy();
        }
        expect(invocations).toStrictEqual([]);
      }).pipe(withPublisher(fakeSpawner([], invocations)))
    );
  });

  it.effect("rejects Development before invoking Vercel", () => {
    const invocations: Invocation[] = [];
    return Effect.gen(function* () {
      const publisher = yield* RuntimeEnvironmentPublisher;
      const error = yield* publisher
        .prepare({
          destination: {
            destination: "vercel",
            environments: ["development"],
            publicationMode: "create",
            workspaceRoot: ".",
            yes: true,
          },
          manifest,
        })
        .pipe(Effect.flip);

      expect(error).toBeInstanceOf(RuntimeEnvironmentPreflightError);
      expect(error.operation).toBe("policy");
      expect(invocations).toStrictEqual([]);
    }).pipe(withPublisher(fakeSpawner([], invocations)));
  });

  it.effect(
    "discovers the workspace root from a package working directory",
    () => {
      const invocations: Invocation[] = [];
      return Effect.gen(function* () {
        const publisher = yield* RuntimeEnvironmentPublisher;
        const error = yield* publisher
          .prepare({
            destination: {
              destination: "vercel",
              environments: ["production"],
              publicationMode: "create",
              yes: true,
            },
            manifest: apiManifest,
          })
          .pipe(Effect.flip);

        expect(error.operation).toBe("link");
        expect(error.message).toMatch(
          /apps[/\\]api[/\\]\.vercel[/\\]project\.json/u
        );
        expect(error.message).not.toContain("packages/cli-core/apps");
        expect(invocations).toHaveLength(1);
      }).pipe(
        withPublisher(
          fakeSpawner([{ stdout: "Vercel CLI 59.3.0\n" }], invocations)
        )
      );
    }
  );

  it.effect("refuses existing Vercel variables without changing them", () => {
    const invocations: Invocation[] = [];
    return Effect.scoped(
      Effect.gen(function* () {
        const workspaceRoot = yield* makeLinkedWorkspace;
        const publisher = yield* RuntimeEnvironmentPublisher;
        const error = yield* publisher
          .prepare({
            destination: {
              destination: "vercel",
              environments: ["preview"],
              publicationMode: "create",
              workspaceRoot,
              yes: true,
            },
            manifest,
          })
          .pipe(Effect.flip);

        expect(error.operation).toBe("conflicts");
        expect(invocations.map(({ args }) => args.slice(0, 2))).toStrictEqual([
          ["--version"],
          ["api", "/v10/projects/prj_web/env?teamId=team_123"],
          ["api", "/v10/projects/prj_api/env?teamId=team_123"],
        ]);
        expect(
          invocations
            .filter(({ args }) => args[0] === "api")
            .every(({ args }) => !args.includes("--silent"))
        ).toBeTruthy();
      }).pipe(
        withPublisher(
          fakeSpawner(
            [
              { stdout: "Vercel CLI 59.3.0\n" },
              {
                stdout: encodeJson({ envs: [] }),
              },
              {
                stdout: encodeJson({
                  envs: [{ key: "SECRET_VALUE", target: ["preview"] }],
                }),
              },
            ],
            invocations
          )
        )
      )
    );
  });

  it.effect(
    "publishes one typed batch through the linked Vercel project",
    () => {
      const invocations: Invocation[] = [];
      return Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeLinkedWorkspace;
          const publisher = yield* RuntimeEnvironmentPublisher;
          const prepared = yield* publisher.prepare({
            destination: {
              destination: "vercel",
              environments: ["preview", "production"],
              publicationMode: "create",
              workspaceRoot,
              yes: true,
            },
            manifest,
          });
          const receipt = yield* publisher.publish(prepared, {
            PUBLIC_VALUE: "public",
            SECRET_VALUE: Redacted.make("secret"),
          });

          expect(receipt).toMatchObject({
            deploymentRequired: true,
            destination: "vercel",
            environments: ["preview", "production"],
            projects: [
              {
                application: "web",
                projectId: "prj_web",
                variables: ["PUBLIC_VALUE"],
              },
              {
                application: "api",
                projectId: "prj_api",
                variables: ["PUBLIC_VALUE", "SECRET_VALUE"],
              },
            ],
          });
          const requests = invocations.filter(({ args }) =>
            args.includes("POST")
          );
          expect(requests[0]?.args).toContain(
            "/v10/projects/prj_web/env?teamId=team_123"
          );
          expect(requests[1]?.args).toContain(
            "/v10/projects/prj_api/env?teamId=team_123"
          );
          expect(decodeJson(requests[0]?.body ?? "null")).toStrictEqual([
            {
              key: "PUBLIC_VALUE",
              target: ["preview"],
              type: "encrypted",
              value: "public",
            },
            {
              key: "PUBLIC_VALUE",
              target: ["production"],
              type: "encrypted",
              value: "public",
            },
          ]);
          expect(decodeJson(requests[1]?.body ?? "null")).toStrictEqual([
            {
              key: "PUBLIC_VALUE",
              target: ["preview"],
              type: "encrypted",
              value: "public",
            },
            {
              key: "PUBLIC_VALUE",
              target: ["production"],
              type: "encrypted",
              value: "public",
            },
            {
              key: "SECRET_VALUE",
              target: ["preview"],
              type: "sensitive",
              value: "secret",
            },
            {
              key: "SECRET_VALUE",
              target: ["production"],
              type: "sensitive",
              value: "secret",
            },
          ]);
        }).pipe(
          withPublisher(
            fakeSpawner(
              [
                { stdout: "Vercel CLI 59.3.0\n" },
                { stdout: encodeJson({ envs: [] }) },
                { stdout: encodeJson({ envs: [] }) },
                { stdout: "" },
                { stdout: "" },
              ],
              invocations
            )
          )
        )
      );
    }
  );

  it.effect(
    "publishes branch previews and existing custom environments",
    () => {
      const invocations: Invocation[] = [];
      return Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeLinkedWorkspace;
          const publisher = yield* RuntimeEnvironmentPublisher;
          const prepared = yield* publisher.prepare({
            destination: {
              destination: "vercel",
              environments: ["preview:feature/auth", "staging"],
              publicationMode: "create",
              workspaceRoot,
              yes: true,
            },
            manifest: apiManifest,
          });
          yield* publisher.publish(prepared, {
            SECRET_VALUE: Redacted.make("secret"),
          });

          const publication = invocations.find(({ args }) =>
            args.includes("POST")
          );
          expect(decodeJson(publication?.body ?? "null")).toStrictEqual([
            {
              gitBranch: "feature/auth",
              key: "SECRET_VALUE",
              target: ["preview"],
              type: "sensitive",
              value: "secret",
            },
            {
              customEnvironmentIds: ["env_staging"],
              key: "SECRET_VALUE",
              target: [],
              type: "sensitive",
              value: "secret",
            },
          ]);
        }).pipe(
          withPublisher(
            fakeSpawner(
              [
                { stdout: "Vercel CLI 59.3.0\n" },
                {
                  stdout: encodeJson({
                    environments: [{ id: "env_staging", slug: "staging" }],
                  }),
                },
                { stdout: encodeJson({ envs: [] }) },
                { stdout: "" },
              ],
              invocations
            )
          )
        )
      );
    }
  );

  it.effect(
    "overwrites only selected provider variables through Vercel upsert",
    () => {
      const invocations: Invocation[] = [];
      return Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeLinkedWorkspace;
          const publisher = yield* RuntimeEnvironmentPublisher;
          const prepared = yield* publisher.prepare({
            destination: {
              destination: "vercel",
              environments: ["production"],
              publicationMode: "overwrite",
              workspaceRoot,
              yes: true,
            },
            manifest: apiManifest,
          });
          const receipt = yield* publisher.publish(prepared, {
            SECRET_VALUE: Redacted.make("replacement"),
          });

          expect(receipt).toMatchObject({
            destination: "vercel",
            publicationMode: "overwrite",
          });
          const publication = invocations.find(({ args }) =>
            args.includes("POST")
          );
          expect(publication?.args).toContain(
            "/v10/projects/prj_api/env?teamId=team_123&upsert=true"
          );
          expect(decodeJson(publication?.body ?? "null")).toStrictEqual([
            {
              key: "SECRET_VALUE",
              target: ["production"],
              type: "sensitive",
              value: "replacement",
            },
          ]);
        }).pipe(
          withPublisher(
            fakeSpawner(
              [
                { stdout: "Vercel CLI 59.3.0\n" },
                {
                  stdout: encodeJson({
                    envs: [
                      { key: "SECRET_VALUE", target: ["production"] },
                      { key: "UNRELATED", target: ["production"] },
                    ],
                  }),
                },
                { stdout: "" },
              ],
              invocations
            )
          )
        )
      );
    }
  );

  it.effect(
    "refuses an existing variable assigned to a custom environment",
    () => {
      const invocations: Invocation[] = [];
      return Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeLinkedWorkspace;
          const publisher = yield* RuntimeEnvironmentPublisher;
          const error = yield* publisher
            .prepare({
              destination: {
                destination: "vercel",
                environments: ["staging"],
                publicationMode: "create",
                workspaceRoot,
                yes: true,
              },
              manifest: apiManifest,
            })
            .pipe(Effect.flip);

          expect(error.operation).toBe("conflicts");
          expect(
            invocations.some(({ args }) => args.includes("POST"))
          ).toBeFalsy();
          expect(
            invocations
              .filter(({ args }) => args[0] === "api")
              .every(({ args }) => !args.includes("--silent"))
          ).toBeTruthy();
        }).pipe(
          withPublisher(
            fakeSpawner(
              [
                { stdout: "Vercel CLI 59.3.0\n" },
                {
                  stdout: encodeJson({
                    environments: [{ id: "env_staging", slug: "staging" }],
                  }),
                },
                {
                  stdout: encodeJson({
                    envs: [
                      {
                        customEnvironmentIds: ["env_staging"],
                        key: "SECRET_VALUE",
                        target: [],
                      },
                    ],
                  }),
                },
              ],
              invocations
            )
          )
        )
      );
    }
  );

  it.effect("reports a known partial multi-project publication", () => {
    const invocations: Invocation[] = [];
    return Effect.scoped(
      Effect.gen(function* () {
        const workspaceRoot = yield* makeLinkedWorkspace;
        const publisher = yield* RuntimeEnvironmentPublisher;
        const prepared = yield* publisher.prepare({
          destination: {
            destination: "vercel",
            environments: ["production"],
            publicationMode: "create",
            workspaceRoot,
            yes: true,
          },
          manifest,
        });
        const error = yield* publisher
          .publish(prepared, {
            PUBLIC_VALUE: "public",
            SECRET_VALUE: Redacted.make("secret"),
          })
          .pipe(Effect.flip);

        expect(error).toBeInstanceOf(RuntimeEnvironmentPublicationIncomplete);
        expect(error).toMatchObject({
          failedApplication: "api",
          publishedApplications: ["web"],
        });
        expect(
          invocations.filter(({ args }) => args.includes("POST"))
        ).toHaveLength(2);
      }).pipe(
        withPublisher(
          fakeSpawner(
            [
              { stdout: "Vercel CLI 59.3.0\n" },
              { stdout: encodeJson({ envs: [] }) },
              { stdout: encodeJson({ envs: [] }) },
              { stdout: "" },
              { exitCode: 1, stderr: "request failed", stdout: "" },
            ],
            invocations
          )
        )
      )
    );
  });

  it.effect("reports a publication spawn failure as a known failure", () => {
    const invocations: Invocation[] = [];
    return Effect.scoped(
      Effect.gen(function* () {
        const workspaceRoot = yield* makeLinkedWorkspace;
        const publisher = yield* RuntimeEnvironmentPublisher;
        const prepared = yield* publisher.prepare({
          destination: {
            destination: "vercel",
            environments: ["preview"],
            publicationMode: "create",
            workspaceRoot,
            yes: true,
          },
          manifest: apiManifest,
        });
        const error = yield* publisher
          .publish(prepared, {
            SECRET_VALUE: Redacted.make("secret"),
          })
          .pipe(Effect.flip);

        expect(error).toBeInstanceOf(RuntimeEnvironmentPublicationError);
      }).pipe(
        withPublisher(
          fakeSpawner(
            [
              { stdout: "Vercel CLI 59.3.0\n" },
              { stdout: encodeJson({ envs: [] }) },
              { spawnFailure: true },
            ],
            invocations
          )
        )
      )
    );
  });

  it.effect(
    "reports an ambiguous create-only response without retrying",
    () => {
      const invocations: Invocation[] = [];
      return Effect.scoped(
        Effect.gen(function* () {
          const workspaceRoot = yield* makeLinkedWorkspace;
          const publisher = yield* RuntimeEnvironmentPublisher;
          const prepared = yield* publisher.prepare({
            destination: {
              destination: "vercel",
              environments: ["preview"],
              publicationMode: "create",
              workspaceRoot,
              yes: true,
            },
            manifest: apiManifest,
          });
          const error = yield* publisher
            .publish(prepared, {
              SECRET_VALUE: Redacted.make("secret"),
            })
            .pipe(Effect.flip);

          expect(error).toBeInstanceOf(
            RuntimeEnvironmentPublicationOutcomeUnknown
          );
          expect(
            invocations.filter(({ args }) => args.includes("POST"))
          ).toHaveLength(1);
        }).pipe(
          withPublisher(
            fakeSpawner(
              [
                { stdout: "Vercel CLI 59.3.0\n" },
                { stdout: encodeJson({ envs: [] }) },
                { exitCode: 1, stderr: "request outcome unavailable" },
              ],
              invocations
            )
          )
        )
      );
    }
  );

  it.effect("retries an ambiguous overwrite with the same upsert", () => {
    const invocations: Invocation[] = [];
    return Effect.scoped(
      Effect.gen(function* () {
        const workspaceRoot = yield* makeLinkedWorkspace;
        const publisher = yield* RuntimeEnvironmentPublisher;
        const prepared = yield* publisher.prepare({
          destination: {
            destination: "vercel",
            environments: ["preview"],
            publicationMode: "overwrite",
            workspaceRoot,
            yes: true,
          },
          manifest: apiManifest,
        });
        yield* publisher.publish(prepared, {
          SECRET_VALUE: Redacted.make("secret"),
        });

        const publications = invocations.filter(({ args }) =>
          args.includes("POST")
        );
        expect(publications).toHaveLength(2);
        expect(publications[0]?.args).toContain(
          "/v10/projects/prj_api/env?teamId=team_123&upsert=true"
        );
        expect(publications[1]).toStrictEqual(publications[0]);
      }).pipe(
        withPublisher(
          fakeSpawner(
            [
              { stdout: "Vercel CLI 59.3.0\n" },
              { stdout: encodeJson({ envs: [] }) },
              { exitCode: 1, stderr: "request outcome unavailable" },
              { stdout: "" },
            ],
            invocations
          )
        )
      )
    );
  });
});
