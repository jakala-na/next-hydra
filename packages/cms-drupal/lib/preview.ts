import "server-only";

import { graphqlClient } from "../client";
import { graphql } from "../graphql";
import {
  type DrupalGraphqlPreviewContext,
  isSafeDrupalPreviewPath,
} from "./preview-context";

const previewHandshakeQuery = graphql(`
  query DrupalPreviewHandshake($id: ID!, $token: String!) {
    preview(id: $id, token: $token) {
      __typename
      ... on NodeLandingPage {
        uuid
        path
      }
    }
  }
`);

export class DrupalPreviewValidationError extends Error {
  constructor(cause: unknown) {
    super("Failed to validate the Drupal preview", { cause });
    this.name = "DrupalPreviewValidationError";
  }
}

export async function validateDrupalPreview(
  id: string,
  token: string
): Promise<DrupalGraphqlPreviewContext | undefined> {
  const response = await graphqlClient(true).query(previewHandshakeQuery, {
    id,
    token,
  });

  if (response.error) {
    throw new DrupalPreviewValidationError(response.error);
  }

  const preview = response.data?.preview;
  if (
    preview?.__typename !== "NodeLandingPage" ||
    !preview.path ||
    !isSafeDrupalPreviewPath(preview.path)
  ) {
    return;
  }

  return { id: preview.uuid, kind: "graphql", path: preview.path, token };
}
