import { getContentstackEndpoint } from "@contentstack/utils";
import { z } from "zod";

const editorUrl = z
  .string()
  .url()
  .transform((value) => new URL(value).origin)
  .parse(
    getContentstackEndpoint(
      process.env.CONTENTSTACK_REGION ?? "NA",
      "application"
    )
  );

export const cmsFrameAncestors: readonly string[] = [editorUrl];
