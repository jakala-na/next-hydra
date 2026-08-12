import { z } from "zod";

import { PROVIDER_SLOTS } from "./types.js";

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

const installUnitSchema = z
  .object({
    cwd: workspaceRelativePathSchema,
    item: z.string().min(1),
  })
  .strict();

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

const pnpmPatchSchema = z
  .object({
    dependency: z.string().min(1),
    path: workspaceRelativePathSchema,
  })
  .strict();

const routeSchema = z
  .object({
    app: workspaceRelativePathSchema,
    export: z.string().min(1),
    method: z.enum([
      "GET",
      "POST",
      "PUT",
      "PATCH",
      "DELETE",
      "HEAD",
      "OPTIONS",
    ]),
    module: z.string().min(1),
    path: z
      .string()
      .startsWith("/")
      .refine((value) => !value.includes("?"), "must not contain a query")
      .refine((value) => !value.includes("#"), "must not contain a fragment"),
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

export const selectionDefinitionSchema = z
  .object({
    assets: z
      .array(
        z
          .object({
            source: workspaceRelativePathSchema,
            target: workspaceRelativePathSchema,
          })
          .strict()
      )
      .default([]),
    compatibility: z
      .object({
        conflicts: z.array(z.string().min(1)).default([]),
        requires: z.array(z.string().min(1)).default([]),
      })
      .strict()
      .default({ conflicts: [], requires: [] }),
    id: z.string().min(1),
    installUnits: z.array(installUnitSchema),
    kind: z.enum(["provider", "add-on", "preset"]),
    packages: z.array(packageRequirementSchema).default([]),
    pnpmPatches: z.array(pnpmPatchSchema).default([]),
    routes: z.array(routeSchema).default([]),
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

    if (definition.kind !== "provider" && definition.slot) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: `${definition.kind} must not declare a provider slot`,
        path: ["slot"],
      });
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
