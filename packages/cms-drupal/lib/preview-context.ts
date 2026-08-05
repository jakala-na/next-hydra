import { z } from "zod";

export const DRUPAL_PREVIEW_COOKIE = "__drupal_preview";

const PREVIEW_SESSION_MAX_AGE_SECONDS = 60 * 60;

export const DRUPAL_PREVIEW_COOKIE_OPTIONS = {
  httpOnly: true,
  maxAge: PREVIEW_SESSION_MAX_AGE_SECONDS,
  path: "/",
  sameSite: "none" as const,
  secure: true,
};

export function isSafeDrupalPreviewPath(path: string): boolean {
  return path.startsWith("/") && !path.startsWith("//");
}

const graphqlPreviewContextSchema = z.object({
  id: z.string().min(1),
  kind: z.literal("graphql"),
  path: z.string().refine(isSafeDrupalPreviewPath),
  token: z.string().min(1),
});

const nextPreviewContextSchema = z.object({
  kind: z.literal("next"),
  path: z.string().refine(isSafeDrupalPreviewPath),
  revision: z.string().min(1).nullable(),
});

const drupalPreviewContextSchema = z.discriminatedUnion("kind", [
  graphqlPreviewContextSchema,
  nextPreviewContextSchema,
]);

export type DrupalGraphqlPreviewContext = z.infer<
  typeof graphqlPreviewContextSchema
>;
export type DrupalNextPreviewContext = z.infer<typeof nextPreviewContextSchema>;
export type DrupalPreviewContext = z.infer<typeof drupalPreviewContextSchema>;

export function encodeDrupalPreviewContext(
  context: DrupalPreviewContext
): string {
  return Buffer.from(JSON.stringify(context)).toString("base64url");
}

export function decodeDrupalPreviewContext(
  value: string | undefined
): DrupalPreviewContext | undefined {
  if (!value) {
    return;
  }

  try {
    const decoded: unknown = JSON.parse(
      Buffer.from(value, "base64url").toString("utf8")
    );
    const result = drupalPreviewContextSchema.safeParse(decoded);
    return result.success ? result.data : undefined;
  } catch {
    // Treat malformed cookie values as an absent preview session.
  }
}
