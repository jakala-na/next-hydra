/** Maintainer task identity; runtime app manifests remain ordinary customer-compatible files. */
export function workspaceTaskManifest(name: string, localSourcesOnly = true) {
  if (!/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(name)) {
    throw new Error(`Invalid workspace task name: ${name}`);
  }
  return {
    devDependencies: { "create-next-hydra": "workspace:*" },
    name: `@workspaces/${name}`,
    nextHydra: { localSourcesOnly },
    private: true,
    scripts: {
      "workspace:e2e": `node ../../../packages/create-next-hydra/dist/run-workspace-e2e.js ${name}`,
      build: `node ../../../packages/create-next-hydra/dist/cli.js compose ${name} --run build`,
    },
  };
}
