import packageManifest from "../package.json" with { type: "json" };

export const CLI_VERSION = packageManifest.version;
