import type { ViteUserConfig } from "vitest/config";

declare const config: ViteUserConfig;
declare const serverOnlyShim: string;
declare const workspaceConfig: ViteUserConfig;

export default config;
export { serverOnlyShim, workspaceConfig };
