import {
  Console,
  Effect,
  FileSystem,
  Layer,
  Path,
  Ref,
  Schema,
  Stream,
  Terminal,
} from "effect";
import { ChildProcess, ChildProcessSpawner } from "effect/unstable/process";

import {
  RuntimeEnvironmentPublicationError,
  RuntimeEnvironmentPublicationIncomplete,
  RuntimeEnvironmentPublicationOutcomeUnknown,
  VercelRuntimeEnvironmentProjectReceipt,
  VercelRuntimeEnvironmentPublicationReceipt,
  VercelRuntimeEnvironmentStore,
} from "./runtime-environment-model";
import type {
  PreparedVercelRuntimeEnvironmentProject,
  RequestedVercelEnvironment,
  ResolvedVercelEnvironment,
  RuntimeApplication,
  RuntimeEnvironmentPublicationMode,
  RuntimeEnvironmentPreflightError,
  RuntimeEnvironmentValues,
  RuntimeEnvironmentVariable,
} from "./runtime-environment-model";
import {
  confirmRuntimeEnvironmentPublication,
  decodeRuntimeEnvironmentJson,
  revealRuntimeEnvironmentValue,
  runtimeEnvironmentPreflightError,
  validateRuntimeEnvironmentValues,
} from "./runtime-environment-support";

const MINIMUM_VERCEL_CLI_VERSION = [50, 5, 1] as const;

const LinkedVercelProject = Schema.Struct({
  orgId: Schema.NonEmptyString,
  projectId: Schema.NonEmptyString,
});

const ListedVercelEnvironment = Schema.Struct({
  customEnvironmentIds: Schema.optional(Schema.Array(Schema.String)),
  gitBranch: Schema.optional(Schema.String),
  key: Schema.NonEmptyString,
  target: Schema.optional(
    Schema.Union([Schema.String, Schema.Array(Schema.String)])
  ),
});

const ListedVercelEnvironments = Schema.Struct({
  envs: Schema.Array(ListedVercelEnvironment),
});

const VercelCustomEnvironment = Schema.Struct({
  id: Schema.NonEmptyString,
  slug: Schema.NonEmptyString,
});

const VercelCustomEnvironments = Schema.Struct({
  environments: Schema.Array(VercelCustomEnvironment),
});

const VercelEnvironmentVariableInput = Schema.Struct({
  customEnvironmentIds: Schema.optional(Schema.Array(Schema.String)),
  gitBranch: Schema.optional(Schema.String),
  key: Schema.NonEmptyString,
  target: Schema.Array(Schema.Literals(["production", "preview"])),
  type: Schema.Literals(["encrypted", "sensitive"]),
  value: Schema.String,
});

const encodeVercelEnvironmentVariables = Schema.encodeSync(
  Schema.fromJsonString(Schema.Array(VercelEnvironmentVariableInput))
);

const collectOutput = Effect.fn("VercelEnvironment.collectOutput")(function* (
  spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
  command: ChildProcess.Command
) {
  const handle = yield* spawner.spawn(command);
  return yield* Effect.all(
    {
      exitCode: handle.exitCode,
      stderr: Stream.decodeText(handle.stderr).pipe(Stream.mkString),
      stdout: Stream.decodeText(handle.stdout).pipe(Stream.mkString),
    },
    { concurrency: "unbounded" }
  );
});

const versionAtLeast = (
  actual: readonly number[],
  minimum: readonly number[]
) => {
  for (let index = 0; index < minimum.length; index += 1) {
    const actualPart = actual[index] ?? 0;
    const minimumPart = minimum[index] ?? 0;
    if (actualPart !== minimumPart) {
      return actualPart > minimumPart;
    }
  }
  return true;
};

const requireVercelVersion = Effect.fn("VercelEnvironment.requireVersion")(
  function* (spawner: ChildProcessSpawner.ChildProcessSpawner["Service"]) {
    const result = yield* Effect.scoped(
      collectOutput(
        spawner,
        ChildProcess.make("vercel", ["--version"], {
          stderr: "pipe",
          stdout: "pipe",
        })
      )
    ).pipe(
      Effect.mapError((cause) =>
        runtimeEnvironmentPreflightError(
          "vercel",
          "vercel-version",
          "Vercel CLI is not available",
          cause
        )
      )
    );
    const match = /(?<version>\d+\.\d+\.\d+)/u.exec(result.stdout);
    const version = match?.groups?.version
      ?.split(".")
      .map((part) => Math.trunc(Number(part)));

    if (
      result.exitCode !== 0 ||
      version === undefined ||
      !versionAtLeast(version, MINIMUM_VERCEL_CLI_VERSION)
    ) {
      return yield* runtimeEnvironmentPreflightError(
        "vercel",
        "vercel-version",
        `Vercel CLI ${MINIMUM_VERCEL_CLI_VERSION.join(
          "."
        )} or newer is required`,
        new Error("Unsupported Vercel CLI version")
      );
    }
    return yield* Effect.void;
  }
);

const parseVercelEnvironmentSelectors = (
  selectors: readonly string[]
): Effect.Effect<
  readonly RequestedVercelEnvironment[],
  RuntimeEnvironmentPreflightError
> => {
  const uniqueSelectors = [...new Set(selectors)];
  if (uniqueSelectors.length === 0) {
    return Effect.fail(
      runtimeEnvironmentPreflightError(
        "vercel",
        "validation",
        "Select at least one Vercel environment",
        new Error("No Vercel environments selected")
      )
    );
  }

  const environments: RequestedVercelEnvironment[] = [];
  for (const selector of uniqueSelectors) {
    if (selector === "development") {
      return Effect.fail(
        runtimeEnvironmentPreflightError(
          "vercel",
          "policy",
          "Development is not a supported Vercel config-store target; use local dotenv for development",
          new Error("Vercel Development is unsupported")
        )
      );
    }
    if (selector === "production" || selector === "preview") {
      environments.push({ kind: "built-in", selector });
      continue;
    }
    if (selector.startsWith("preview:")) {
      const gitBranch = selector.slice("preview:".length).trim();
      if (gitBranch.length === 0) {
        return Effect.fail(
          runtimeEnvironmentPreflightError(
            "vercel",
            "validation",
            "A branch-specific Preview selector must use preview:<branch>",
            new Error("Preview branch is empty")
          )
        );
      }
      environments.push({
        gitBranch,
        kind: "preview-branch",
        selector,
      });
      continue;
    }
    environments.push({ kind: "custom", selector, slug: selector });
  }
  return Effect.succeed(environments);
};

const listedTargets = (target: string | readonly string[] | undefined) => {
  if (target === undefined) {
    return [];
  }
  return Schema.is(Schema.Array(Schema.String))(target) ? target : [target];
};

const listedEnvironmentMatches = (
  variable: typeof ListedVercelEnvironment.Type,
  environment: ResolvedVercelEnvironment
) => {
  if (
    variable.target === undefined &&
    variable.customEnvironmentIds === undefined
  ) {
    return true;
  }
  if (environment.customEnvironmentId !== undefined) {
    return variable.customEnvironmentIds?.includes(
      environment.customEnvironmentId
    );
  }
  const targets = listedTargets(variable.target);
  return (
    environment.target !== undefined &&
    targets.includes(environment.target) &&
    (environment.gitBranch === undefined
      ? variable.gitBranch === undefined
      : variable.gitBranch === environment.gitBranch)
  );
};

const discoverWorkspaceRoot = Effect.fn(
  "VercelEnvironment.discoverWorkspaceRoot"
)(function* (fileSystem: FileSystem.FileSystem, path: Path.Path) {
  let candidate = path.resolve(".");
  while (true) {
    const workspaceFile = path.join(candidate, "pnpm-workspace.yaml");
    const exists = yield* fileSystem
      .exists(workspaceFile)
      .pipe(
        Effect.mapError((cause) =>
          runtimeEnvironmentPreflightError(
            "vercel",
            "workspace",
            `Could not inspect the workspace marker at ${workspaceFile}`,
            cause
          )
        )
      );
    if (exists) {
      return candidate;
    }
    const parent = path.dirname(candidate);
    if (parent === candidate) {
      return yield* runtimeEnvironmentPreflightError(
        "vercel",
        "workspace",
        "Could not find pnpm-workspace.yaml from the current working directory",
        new Error("Workspace root not found")
      );
    }
    candidate = parent;
  }
});

const vercelProjectEnvironmentEndpoint = (
  projectId: string,
  organizationId: string,
  publicationMode: RuntimeEnvironmentPublicationMode = "create"
) =>
  `/v10/projects/${encodeURIComponent(
    projectId
  )}/env?teamId=${encodeURIComponent(organizationId)}${
    publicationMode === "overwrite" ? "&upsert=true" : ""
  }`;

const prepareVercelProject = Effect.fn("VercelEnvironment.prepareProject")(
  function* (
    application: RuntimeApplication,
    manifest: readonly RuntimeEnvironmentVariable[],
    publicationMode: RuntimeEnvironmentPublicationMode,
    requestedEnvironments: readonly RequestedVercelEnvironment[],
    workspaceRoot: string,
    fileSystem: FileSystem.FileSystem,
    path: Path.Path,
    spawner: ChildProcessSpawner.ChildProcessSpawner["Service"]
  ) {
    const applicationManifest = manifest.filter(({ applications }) =>
      applications.includes(application)
    );
    const cwd = path.join(workspaceRoot, "apps", application);
    const linkPath = path.join(cwd, ".vercel", "project.json");
    const linkContents = yield* fileSystem
      .readFileString(linkPath)
      .pipe(
        Effect.mapError((cause) =>
          runtimeEnvironmentPreflightError(
            "vercel",
            "link",
            `No readable linked Vercel project was found for ${application} at ${linkPath}`,
            cause
          )
        )
      );
    const link = yield* decodeRuntimeEnvironmentJson(
      LinkedVercelProject,
      linkContents
    ).pipe(
      Effect.mapError((cause) =>
        runtimeEnvironmentPreflightError(
          "vercel",
          "link",
          `The linked ${application} Vercel project file is invalid: ${linkPath}`,
          cause
        )
      )
    );
    const requestedCustomEnvironments = requestedEnvironments.filter(
      (
        environment
      ): environment is Extract<
        RequestedVercelEnvironment,
        { readonly kind: "custom" }
      > => environment.kind === "custom"
    );
    let customEnvironments: readonly (typeof VercelCustomEnvironment.Type)[] =
      [];
    if (requestedCustomEnvironments.length > 0) {
      customEnvironments = yield* Effect.scoped(
        collectOutput(
          spawner,
          ChildProcess.make(
            "vercel",
            [
              "api",
              `/projects/${encodeURIComponent(
                link.projectId
              )}/custom-environments?teamId=${encodeURIComponent(link.orgId)}`,
              "--raw",
              "--non-interactive",
            ],
            { cwd, stderr: "pipe", stdout: "pipe" }
          )
        )
      ).pipe(
        Effect.mapError((cause) =>
          runtimeEnvironmentPreflightError(
            "vercel",
            "vercel-access",
            `Could not list custom environments for ${application}`,
            cause
          )
        ),
        Effect.flatMap((result) =>
          result.exitCode === 0
            ? decodeRuntimeEnvironmentJson(
                VercelCustomEnvironments,
                result.stdout
              ).pipe(
                Effect.mapError((cause) =>
                  runtimeEnvironmentPreflightError(
                    "vercel",
                    "vercel-access",
                    `Vercel CLI returned an invalid custom-environment listing for ${application}`,
                    cause
                  )
                ),
                Effect.map(({ environments }) => environments)
              )
            : Effect.fail(
                runtimeEnvironmentPreflightError(
                  "vercel",
                  "vercel-access",
                  `Vercel CLI could not list custom environments for ${application}`,
                  new Error(
                    result.stderr.trim() ||
                      "Vercel custom-environment request failed"
                  )
                )
              )
        )
      );
    }
    const resolvedEnvironments = yield* Effect.forEach(
      (
        environment: RequestedVercelEnvironment
      ): Effect.Effect<
        ResolvedVercelEnvironment,
        RuntimeEnvironmentPreflightError
      > => {
        if (environment.kind === "built-in") {
          const resolved: ResolvedVercelEnvironment = {
            selector: environment.selector,
            target: environment.selector,
          };
          return Effect.succeed(resolved);
        }
        if (environment.kind === "preview-branch") {
          const resolved: ResolvedVercelEnvironment = {
            gitBranch: environment.gitBranch,
            selector: environment.selector,
            target: "preview",
          };
          return Effect.succeed(resolved);
        }
        const customEnvironment = customEnvironments.find(
          ({ slug }) => slug === environment.slug
        );
        return customEnvironment === undefined
          ? Effect.fail(
              runtimeEnvironmentPreflightError(
                "vercel",
                "validation",
                `Custom Vercel environment ${environment.slug} does not exist for ${application}`,
                new Error("Unknown Vercel custom environment")
              )
            )
          : Effect.succeed<ResolvedVercelEnvironment>({
              customEnvironmentId: customEnvironment.id,
              selector: environment.selector,
            });
      }
    )(requestedEnvironments);
    const environmentEndpoint = vercelProjectEnvironmentEndpoint(
      link.projectId,
      link.orgId
    );
    const listResult = yield* Effect.scoped(
      collectOutput(
        spawner,
        ChildProcess.make(
          "vercel",
          ["api", environmentEndpoint, "--raw", "--non-interactive"],
          { cwd, stderr: "pipe", stdout: "pipe" }
        )
      )
    ).pipe(
      Effect.mapError((cause) =>
        runtimeEnvironmentPreflightError(
          "vercel",
          "vercel-access",
          `Could not verify access to the linked ${application} Vercel project`,
          cause
        )
      )
    );
    if (listResult.exitCode !== 0) {
      return yield* runtimeEnvironmentPreflightError(
        "vercel",
        "vercel-access",
        `Vercel CLI could not access the linked ${application} project using local credentials`,
        new Error(listResult.stderr.trim() || "Vercel environment API failed")
      );
    }
    const listed = yield* decodeRuntimeEnvironmentJson(
      ListedVercelEnvironments,
      listResult.stdout
    ).pipe(
      Effect.mapError((cause) =>
        runtimeEnvironmentPreflightError(
          "vercel",
          "vercel-access",
          `Vercel CLI returned an invalid environment listing for ${application}`,
          cause
        )
      )
    );
    const requestedKeys = new Set(applicationManifest.map(({ key }) => key));
    const conflicts = listed.envs.filter(
      (variable) =>
        requestedKeys.has(variable.key) &&
        resolvedEnvironments.some((environment) =>
          listedEnvironmentMatches(variable, environment)
        )
    );
    if (publicationMode === "create" && conflicts.length > 0) {
      return yield* runtimeEnvironmentPreflightError(
        "vercel",
        "conflicts",
        `Vercel variables already exist for ${application} in the selected environments: ${[
          ...new Set(conflicts.map(({ key }) => key)),
        ].join(", ")}`,
        new Error("Vercel environment variable conflict")
      );
    }

    yield* Console.log(
      `Runtime environment destination: ${application} Vercel project ${link.projectId}`
    );
    if (publicationMode === "overwrite") {
      const overwrittenKeys = [...new Set(conflicts.map(({ key }) => key))];
      yield* Console.log(
        overwrittenKeys.length === 0
          ? "Existing selected assignments to overwrite: none; all assignments will be created"
          : `Existing selected assignments to overwrite: ${overwrittenKeys.join(
              ", "
            )}; missing selected assignments will be created`
      );
    }
    yield* Console.log(
      `Variables: ${applicationManifest
        .map(({ key, sensitive }) => `${key}${sensitive ? " (sensitive)" : ""}`)
        .join(", ")}`
    );
    const prepared: PreparedVercelRuntimeEnvironmentProject = {
      application,
      cwd,
      environments: resolvedEnvironments,
      manifest: applicationManifest,
      organizationId: link.orgId,
      projectId: link.projectId,
    };
    return prepared;
  }
);

const publishVercelProject = Effect.fn("VercelEnvironment.publishProject")(
  function* (
    spawner: ChildProcessSpawner.ChildProcessSpawner["Service"],
    project: PreparedVercelRuntimeEnvironmentProject,
    publicationMode: RuntimeEnvironmentPublicationMode,
    values: RuntimeEnvironmentValues
  ) {
    const body = encodeVercelEnvironmentVariables(
      project.manifest.flatMap(({ key, sensitive }) =>
        project.environments.map((environment) => {
          const input = {
            key,
            target:
              environment.target === undefined ? [] : [environment.target],
            type: sensitive ? ("sensitive" as const) : ("encrypted" as const),
            value: revealRuntimeEnvironmentValue(values[key]),
          };
          if (environment.customEnvironmentId !== undefined) {
            return {
              ...input,
              customEnvironmentIds: [environment.customEnvironmentId],
            };
          }
          if (environment.gitBranch !== undefined) {
            return { ...input, gitBranch: environment.gitBranch };
          }
          return input;
        })
      )
    );
    const endpoint = vercelProjectEnvironmentEndpoint(
      project.projectId,
      project.organizationId,
      publicationMode
    );
    const command = ChildProcess.make(
      "vercel",
      [
        "api",
        endpoint,
        "--method",
        "POST",
        "--input",
        "-",
        "--raw",
        "--silent",
        "--non-interactive",
      ],
      {
        cwd: project.cwd,
        stderr: "pipe",
        stdin: Stream.make(new TextEncoder().encode(body)),
        stdout: "pipe",
      }
    );
    const handle = yield* spawner.spawn(command).pipe(
      Effect.mapError(
        (cause) =>
          new RuntimeEnvironmentPublicationError({
            cause,
            destination: "vercel",
            message: `Vercel variable publication could not start for ${project.application}`,
          })
      )
    );
    const result = yield* Effect.all(
      {
        exitCode: handle.exitCode,
        stderr: Stream.decodeText(handle.stderr).pipe(Stream.mkString),
        stdout: Stream.decodeText(handle.stdout).pipe(Stream.mkString),
      },
      { concurrency: "unbounded" }
    ).pipe(
      Effect.mapError(
        (cause) =>
          new RuntimeEnvironmentPublicationOutcomeUnknown({
            cause,
            destination: "vercel",
            message: `Vercel variable publication for ${project.application} may have completed because the CLI result could not be collected`,
          })
      )
    );
    if (result.exitCode !== 0) {
      return yield* new RuntimeEnvironmentPublicationOutcomeUnknown({
        cause: new Error(
          result.stderr.trim() || `Vercel CLI exited with ${result.exitCode}`
        ),
        destination: "vercel",
        message: `Vercel CLI did not establish whether variable publication completed for ${project.application}`,
      });
    }

    return new VercelRuntimeEnvironmentProjectReceipt({
      application: project.application,
      organizationId: project.organizationId,
      projectId: project.projectId,
      variables: project.manifest.map(({ key }) => key),
    });
  }
);

type VercelProjectPublicationError =
  | RuntimeEnvironmentPublicationError
  | RuntimeEnvironmentPublicationOutcomeUnknown;

const failVercelPublication = (
  cause: VercelProjectPublicationError,
  failedApplication: RuntimeApplication,
  published: readonly VercelRuntimeEnvironmentProjectReceipt[]
): Effect.Effect<
  never,
  VercelProjectPublicationError | RuntimeEnvironmentPublicationIncomplete
> => {
  if (published.length === 0) {
    return Effect.fail(cause);
  }
  const publishedApplications = published.map(({ application }) => application);
  return Effect.fail(
    new RuntimeEnvironmentPublicationIncomplete({
      cause,
      destination: "vercel",
      failedApplication,
      message:
        cause._tag === "RuntimeEnvironmentPublicationOutcomeUnknown"
          ? `Variables were published to ${publishedApplications.join(
              ", "
            )}; the ${failedApplication} publication outcome remains unknown`
          : `Variables were published to ${publishedApplications.join(
              ", "
            )}, but ${failedApplication} publication failed`,
      publishedApplications,
    })
  );
};

export const vercelRuntimeEnvironmentStoreLayer = Layer.effect(
  VercelRuntimeEnvironmentStore,
  Effect.gen(function* () {
    const fileSystem = yield* FileSystem.FileSystem;
    const path = yield* Path.Path;
    const spawner = yield* ChildProcessSpawner.ChildProcessSpawner;
    const terminal = yield* Terminal.Terminal;

    return VercelRuntimeEnvironmentStore.of({
      prepare: Effect.fn("VercelRuntimeEnvironmentStore.prepare")(
        function* (destination, manifest) {
          const requestedEnvironments = yield* parseVercelEnvironmentSelectors(
            destination.environments
          );
          const environments = requestedEnvironments.map(
            ({ selector }) => selector
          );
          const workspaceRoot =
            destination.workspaceRoot === undefined
              ? yield* discoverWorkspaceRoot(fileSystem, path)
              : path.resolve(destination.workspaceRoot);

          yield* requireVercelVersion(spawner);
          const applications = [
            ...new Set(
              manifest.flatMap(({ applications: variableApplications }) => [
                ...variableApplications,
              ])
            ),
          ];
          const projects = yield* Effect.forEach(
            (application: RuntimeApplication) =>
              prepareVercelProject(
                application,
                manifest,
                destination.publicationMode,
                requestedEnvironments,
                workspaceRoot,
                fileSystem,
                path,
                spawner
              )
          )(applications);

          yield* Console.log(`Environments: ${environments.join(", ")}`);
          yield* confirmRuntimeEnvironmentPublication(
            fileSystem,
            path,
            terminal,
            destination.publicationMode === "overwrite"
              ? "Provision provider resources and overwrite exact provider-owned variables in these selected Vercel environments?"
              : "Provision provider resources and create these Vercel variables?",
            destination.yes,
            "vercel"
          );

          return {
            destination: "vercel" as const,
            environments,
            manifest,
            projects,
            publicationMode: destination.publicationMode,
          };
        }
      ),
      publish: Effect.fn("VercelRuntimeEnvironmentStore.publish")(
        function* (prepared, values) {
          yield* validateRuntimeEnvironmentValues(
            prepared.manifest,
            values,
            prepared.destination
          );
          const publishedProjects = yield* Ref.make<
            readonly VercelRuntimeEnvironmentProjectReceipt[]
          >([]);
          yield* Effect.forEach(
            Effect.fn("VercelEnvironment.publishPreparedProject")(function* (
              project: PreparedVercelRuntimeEnvironmentProject
            ) {
              const publication = Effect.scoped(
                publishVercelProject(
                  spawner,
                  project,
                  prepared.publicationMode,
                  values
                )
              );
              const receipt = yield* (
                prepared.publicationMode === "overwrite"
                  ? publication.pipe(
                      Effect.retry({
                        times: 2,
                        while: (error) =>
                          error._tag ===
                          "RuntimeEnvironmentPublicationOutcomeUnknown",
                      })
                    )
                  : publication
              ).pipe(
                Effect.catch((error) =>
                  Ref.get(publishedProjects).pipe(
                    Effect.flatMap((published) =>
                      failVercelPublication(
                        error,
                        project.application,
                        published
                      )
                    )
                  )
                )
              );
              yield* Ref.update(publishedProjects, (published) => [
                ...published,
                receipt,
              ]);
            })
          )(prepared.projects);
          const projects = yield* Ref.get(publishedProjects);

          return new VercelRuntimeEnvironmentPublicationReceipt({
            deploymentRequired: true,
            destination: "vercel",
            environments: [...prepared.environments],
            projects,
            publicationMode: prepared.publicationMode,
          });
        }
      ),
    });
  })
);
