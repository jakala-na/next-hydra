import path from "node:path";

import { z } from "zod";

import { PROVIDER_ALIASES, PROVIDER_SLOTS } from "./types.js";

export const NEXT_HYDRA_SELECTION_SCHEMA_URL =
  "https://raw.githubusercontent.com/jakala-na/next-hydra/main/packages/create-next-hydra/schema/selection-definition.json";

const workspaceRelativePathSchema = z
  .string()
  .min(1)
  .refine((value) => !value.startsWith("/"), "must be workspace-relative")
  .refine((value) => !value.includes("\\"), "must use forward slashes")
  .refine(
    (value) => !value.split("/").includes(".."),
    "must not escape the workspace"
  );

const workspaceFilePathSchema = workspaceRelativePathSchema.refine(
  (value) => ![".", "./"].includes(path.posix.normalize(value)),
  "must name a file or directory below the workspace root"
);

const packageRequirementSchema = z
  .object({
    cwd: workspaceRelativePathSchema,
    name: z.string().min(1),
    section: z.enum([
      "dependencies",
      "devDependencies",
      "optionalDependencies",
    ]),
    specifier: z.string().min(1),
  })
  .strict();

const providerBindingSchema = z
  .object({
    sourcePath: workspaceFilePathSchema.optional(),
    specifier: z.string().min(1),
  })
  .strict();

const providerDependencySchema = z
  .object({
    cwd: workspaceRelativePathSchema,
    section: z.enum([
      "dependencies",
      "devDependencies",
      "optionalDependencies",
    ]),
    slot: z.enum(PROVIDER_SLOTS),
  })
  .strict();

const pnpmPatchSchema = z
  .object({
    dependency: z.string().min(1),
    path: workspaceFilePathSchema,
  })
  .strict();

const providerSelectionsSchema = z
  .object({
    auth: z.string().min(1).optional(),
    cms: z.string().min(1).optional(),
    commerce: z.string().min(1).optional(),
  })
  .strict();

const presetSelectionsSchema = z
  .object({
    addOns: z.array(z.string().min(1)).default([]),
    providers: providerSelectionsSchema.optional(),
  })
  .strict();

const providerAliasNames = new Set<string>(Object.values(PROVIDER_ALIASES));

export const selectionDefinitionSchema = z
  .object({
    assets: z
      .array(
        z
          .object({
            source: workspaceFilePathSchema,
            target: workspaceFilePathSchema,
          })
          .strict()
      )
      .default([]),
    binding: providerBindingSchema.optional(),
    compatibility: z
      .object({
        conflicts: z.array(z.string().min(1)).default([]),
        requires: z.array(z.string().min(1)).default([]),
      })
      .strict()
      .default({ conflicts: [], requires: [] }),
    id: z.string().min(1),
    kind: z.enum(["provider", "add-on", "preset"]),
    packages: z.array(packageRequirementSchema).default([]),
    pnpmPatches: z.array(pnpmPatchSchema).default([]),
    providerDependencies: z.array(providerDependencySchema).default([]),
    selections: presetSelectionsSchema.optional(),
    slot: z.enum(PROVIDER_SLOTS).optional(),
  })
  .strict()
  .superRefine((definition, context) => {
    if (definition.kind === "provider" && !definition.slot) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "a provider must declare its slot",
        path: ["slot"],
      });
    }

    if (definition.kind === "provider" && !definition.binding) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "a provider must declare its binding",
        path: ["binding"],
      });
    }

    if (definition.kind !== "provider" && definition.slot) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${definition.kind} must not declare a provider slot`,
        path: ["slot"],
      });
    }

    if (definition.kind !== "provider" && definition.binding) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${definition.kind} must not declare a provider binding`,
        path: ["binding"],
      });
    }

    if (
      definition.kind === "preset" &&
      definition.providerDependencies.length > 0
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "a preset must not declare provider dependencies",
        path: ["providerDependencies"],
      });
    }

    for (const [index, requirement] of definition.packages.entries()) {
      if (providerAliasNames.has(requirement.name)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message:
            "stable Provider aliases must be declared through providerDependencies",
          path: ["packages", index, "name"],
        });
      }
    }

    if (definition.kind === "preset" && !definition.selections) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "a preset must declare selections",
        path: ["selections"],
      });
    }

    if (definition.kind !== "preset" && definition.selections) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${definition.kind} must not declare preset selections`,
        path: ["selections"],
      });
    }
  });

export const workspaceSelectionSchema = z
  .object({
    addOns: z.array(z.string().min(1)).default([]),
    providers: z
      .object({
        auth: z.string().min(1),
        cms: z.string().min(1),
        commerce: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export function formatZodError(error: z.ZodError): string[] {
  return error.issues.map((issue) => {
    const location = issue.path.length > 0 ? issue.path.join(".") : "value";
    return `${location}: ${issue.message}`;
  });
}
