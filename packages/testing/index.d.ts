import type { ViteUserConfig } from "vitest/config";

declare const config: ViteUserConfig;
declare const serverOnlyShim: string;

export default config;
export { serverOnlyShim };
