import { isDeepStrictEqual } from "node:util";

import { Effect, Schema } from "effect";
import { applyEdits, modify } from "jsonc-parser";

import { InvalidComposition } from "./errors.ts";
import { relativeFile } from "./files.ts";

const RequirementName = Schema.String.check(
  Schema.isPattern(
    /^(?:[a-z0-9_.-]+\/[a-z0-9_.-]+|php(?:-64bit|-ipv6|-zts|-debug)?|hhvm|(?:ext|lib)-[a-z0-9](?:[_.-]?[a-z0-9]+)*|composer(?:-(?:plugin|runtime)-api)?)$/u
  )
);
const Requirements = Schema.Record(RequirementName, Schema.NonEmptyString);
const PackageName = Schema.String.check(
  Schema.isPattern(/^[a-z0-9_.-]+\/[a-z0-9_.-]+$/u)
);
const LiteralPath = Schema.NonEmptyString.check(
  Schema.isPattern(/^(?!~)(?!.*(?:\$|%[^%]+%)).+$/u)
);
const isLiteralPath = Schema.is(LiteralPath);
const HttpsUrl = Schema.NonEmptyString.check(
  Schema.isPattern(/^https:\/\/[^@\s/?#]+(?:[/?#][^\s]*)?$/u)
);
const SshGitUrl = Schema.NonEmptyString.check(
  Schema.isPattern(
    /^ssh:\/\/(?:[a-zA-Z0-9._-]+@)?[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?(?::[0-9]+)?\/[^\s?#]+$/u
  )
);
const ScpGitUrl = Schema.NonEmptyString.check(
  Schema.isPattern(
    /^[a-zA-Z0-9._-]+@[a-zA-Z0-9](?:[a-zA-Z0-9.-]*[a-zA-Z0-9])?:[^\s?#]+$/u
  )
);
const isHttpsUrl = Schema.is(HttpsUrl);
const isSshGitUrl = Schema.is(SshGitUrl);
const isScpGitUrl = Schema.is(ScpGitUrl);
const repositoryControls = {
  canonical: Schema.optionalKey(Schema.Boolean),
  exclude: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
  only: Schema.optionalKey(Schema.Array(Schema.NonEmptyString)),
};
const Repository = Schema.Union([
  Schema.Struct({
    ...repositoryControls,
    options: Schema.optionalKey(
      Schema.Struct({
        reference: Schema.optionalKey(
          Schema.Literals(["none", "config", "auto"])
        ),
        symlink: Schema.optionalKey(Schema.Boolean),
        versions: Schema.optionalKey(
          Schema.Record(PackageName, Schema.NonEmptyString)
        ),
      })
    ),
    type: Schema.Literal("path"),
    url: LiteralPath,
  }),
  Schema.Struct({
    ...repositoryControls,
    type: Schema.Literal("composer"),
    url: HttpsUrl,
  }),
  Schema.Struct({
    ...repositoryControls,
    type: Schema.Literals(["vcs", "git"]),
    url: Schema.Union([HttpsUrl, SshGitUrl, ScpGitUrl]),
  }),
]);

export const ComposerContribution = Schema.Struct({
  cwd: Schema.NonEmptyString,
  repositories: Schema.optionalKey(
    Schema.Record(
      Schema.String.check(Schema.isPattern(/^[a-zA-Z0-9_-]+$/u)),
      Repository
    )
  ),
  require: Schema.optionalKey(Requirements),
  "require-dev": Schema.optionalKey(Requirements),
});

export type ComposerContribution = typeof ComposerContribution.Type;

/** Validate and combine declarations, without resolving PHP versions or touching manifests. */
export const composerRequirements = Effect.fn("Composer.requirements")(
  function* (contributions: readonly ComposerContribution[]) {
    const applications = new Map<string, ComposerContribution>();
    for (const contribution of contributions) {
      const cwd =
        contribution.cwd === "." ? "." : yield* relativeFile(contribution.cwd);
      for (const repository of Object.values(contribution.repositories ?? {})) {
        if (repository.type === "path") {
          if (!isLiteralPath(repository.url)) {
            return yield* new InvalidComposition({
              message:
                "Composer path repositories must be literal paths relative to cwd, without home or environment expansion.",
            });
          }
          yield* relativeFile(repository.url);
        } else {
          const vcs = repository.type === "vcs" || repository.type === "git";
          const url = URL.parse(repository.url);
          const https =
            url?.protocol === "https:" &&
            !url.username &&
            !url.password &&
            isHttpsUrl(repository.url);
          const ssh =
            vcs &&
            ((url?.protocol === "ssh:" && isSshGitUrl(repository.url)) ||
              isScpGitUrl(repository.url));
          if (!https && !ssh) {
            return yield* new InvalidComposition({
              message:
                "Composer repositories must use HTTPS; VCS and Git repositories may also use SSH. Keep passwords and tokens in Composer authentication, not repository URLs.",
            });
          }
        }
      }
      const previous = applications.get(cwd);
      for (const section of [
        "require",
        "require-dev",
        "repositories",
      ] as const) {
        for (const [name, value] of Object.entries(
          contribution[section] ?? {}
        )) {
          const existing = previous?.[section]?.[name];
          if (existing !== undefined && !isDeepStrictEqual(existing, value)) {
            return yield* new InvalidComposition({
              message: `Conflicting Composer ${section}.${name} in ${cwd}.`,
            });
          }
        }
      }
      const merged = {
        cwd,
        repositories: {
          ...previous?.repositories,
          ...contribution.repositories,
        },
        require: { ...previous?.require, ...contribution.require },
        "require-dev": {
          ...previous?.["require-dev"],
          ...contribution["require-dev"],
        },
      };
      for (const name of Object.keys(merged.require)) {
        if (name in merged["require-dev"]) {
          return yield* new InvalidComposition({
            message: `Composer package ${name} is declared in both require and require-dev in ${cwd}.`,
          });
        }
      }
      applications.set(cwd, merged);
    }
    return [...applications.values()];
  }
);

const RepositoryList = Schema.Array(Schema.Unknown);
const isRepositoryList = Schema.is(RepositoryList);
const ManifestJson = Schema.fromJsonString(
  Schema.StructWithRest(
    Schema.Struct({
      repositories: Schema.optionalKey(
        Schema.Union([
          RepositoryList,
          Schema.Record(Schema.String, Schema.Unknown),
        ])
      ),
      require: Schema.optionalKey(Schema.Record(Schema.String, Schema.String)),
      "require-dev": Schema.optionalKey(
        Schema.Record(Schema.String, Schema.String)
      ),
    }),
    [Schema.Record(Schema.String, Schema.Unknown)]
  )
);

export type ComposerSection = "require" | "require-dev" | "repositories";

export const composerTarget = (contribution: ComposerContribution): string =>
  contribution.cwd === "."
    ? "composer.json"
    : `${contribution.cwd}/composer.json`;

/** Patch only declared fields. Composer owns resolution, installation and lockfiles. */
export const patchComposerManifest = Effect.fn("Composer.patchManifest")(
  function* (source: string, contribution: ComposerContribution) {
    const manifest = yield* Schema.decodeEffect(ManifestJson)(source);
    const repositories = isRepositoryList(manifest.repositories)
      ? Object.fromEntries(
          manifest.repositories.map((repository, index) => [
            String(index),
            repository,
          ])
        )
      : (manifest.repositories ?? {});
    const current = { ...manifest, repositories };
    const changes: {
      name: string;
      section: ComposerSection;
      status: "create" | "identical" | "changed";
    }[] = [];
    let content = source;
    const edit = (
      field: string[],
      value:
        | string
        | typeof Repository.Type
        | NonNullable<(typeof ManifestJson.Type)["repositories"]>
    ) => {
      content = applyEdits(
        content,
        modify(content, field, value, {
          formattingOptions: { insertSpaces: true, tabSize: 2 },
        })
      );
    };
    for (const section of ["require", "require-dev", "repositories"] as const) {
      const entries = Object.entries<string | typeof Repository.Type>(
        contribution[section] ?? {}
      );
      if (
        section === "repositories" &&
        entries.length > 0 &&
        isRepositoryList(manifest.repositories)
      ) {
        // Composer accepts both forms; numeric keys retain existing repository order.
        edit([section], repositories);
      }
      for (const [name, value] of entries) {
        if (section !== "repositories") {
          const other = section === "require" ? "require-dev" : "require";
          if (Object.hasOwn(manifest[other] ?? {}, name)) {
            return yield* new InvalidComposition({
              message: `${composerTarget(contribution)} already declares ${name} in ${other}; reconcile it before adding it to ${section}.`,
            });
          }
        }
        const previous = current[section]?.[name];
        let status: "create" | "identical" | "changed" = "create";
        if (previous !== undefined) {
          status = isDeepStrictEqual(previous, value) ? "identical" : "changed";
        }
        changes.push({ name, section, status });
        if (status !== "identical") {
          edit([section, name], value);
        }
      }
    }
    return { changes, content };
  }
);
