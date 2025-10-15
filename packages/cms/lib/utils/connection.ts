import type { Maybe } from "../../types";

type LooseConnection<T> = {
  edges?: Maybe<Maybe<{ node?: Maybe<T> }>[]>;
};

/**
 * Extracts nodes from a GraphQL Connection type
 * @param connection - The connection object containing edges and nodes
 * @returns Array of nodes with null/undefined values filtered out
 *
 * @example
 * ```ts
 * const assets = getNodesFromConnection(imageConnection);
 * // Type of assets is inferred as SysAsset[]
 * ```
 */
export const getNodesFromConnection = <T>(
  connection: Maybe<LooseConnection<T>>
): NonNullable<T>[] => {
  if (!connection?.edges) {
    return [];
  }

  return connection.edges
    .filter(
      (edge): edge is NonNullable<typeof edge> =>
        edge !== null && edge !== undefined
    )
    .map((edge) => edge.node)
    .filter(
      (node): node is NonNullable<T> => node !== null && node !== undefined
    );
};

/**
 * Extracts edges from a GraphQL Connection type
 * @param connection - The connection object containing edges
 * @returns Array of edges with null/undefined values filtered out
 *
 * @example
 * ```ts
 * const edges = getEdgesFromConnection(linkConnection);
 * // Access both edge metadata and nodes
 * edges.forEach(edge => {
 *   console.log(edge.node);
 * });
 * ```
 */
export const getEdgesFromConnection = <T>(
  connection: Maybe<LooseConnection<T>>
) => {
  if (!connection?.edges) {
    return [];
  }

  return connection.edges.filter(
    (edge): edge is NonNullable<typeof edge> & { node: NonNullable<T> } =>
      edge !== null &&
      edge !== undefined &&
      edge.node !== null &&
      edge.node !== undefined
  );
};
