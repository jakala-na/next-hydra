import { readFileSync } from "node:fs";
import path from "node:path";

import type { E2EApplicationUrls } from "@repo/e2e-testing";
import { Schema } from "effect";

type Environment = Readonly<Record<string, string | undefined>>;

interface ResolveE2EApplicationRoutingInput {
  readonly environment: Environment;
  readonly getPortlessUrl: (name: string) => string;
  readonly portlessApplicationNames: E2EApplicationNames;
}

export interface E2EApplicationNames {
  readonly admin: string;
  readonly api: string;
  readonly web: string;
}

export interface E2EApplicationRouting {
  readonly mode: "direct" | "external" | "portless";
  readonly urls: E2EApplicationUrls;
}

const PortlessPackageJson = Schema.Struct({
  portless: Schema.Struct({ name: Schema.String }),
});

const loadPortlessApplicationName = (
  workspaceRoot: string,
  application: keyof E2EApplicationNames
): string => {
  const packageJsonPath = path.resolve(
    workspaceRoot,
    "apps",
    application,
    "package.json"
  );
  const packageJson = Schema.decodeUnknownSync(PortlessPackageJson)(
    JSON.parse(readFileSync(packageJsonPath, "utf-8"))
  );

  return packageJson.portless.name;
};

export const loadPortlessApplicationNames = (
  workspaceRoot: string
): E2EApplicationNames => ({
  admin: loadPortlessApplicationName(workspaceRoot, "admin"),
  api: loadPortlessApplicationName(workspaceRoot, "api"),
  web: loadPortlessApplicationName(workspaceRoot, "web"),
});

const directApplicationUrls = {
  admin: "http://localhost:3005",
  api: "http://localhost:3002",
  web: "http://localhost:3001",
} as const;

const externalApplicationUrls = (
  environment: Environment
): E2EApplicationUrls | undefined => {
  const admin = environment.E2E_ADMIN_URL;
  const api = environment.E2E_API_URL;
  const web = environment.E2E_WEB_URL;

  return admin && api && web ? { admin, api, web } : undefined;
};

export const resolveE2EApplicationRouting = ({
  environment,
  getPortlessUrl,
  portlessApplicationNames,
}: ResolveE2EApplicationRoutingInput): E2EApplicationRouting => {
  const externalUrls = externalApplicationUrls(environment);
  if (externalUrls !== undefined) {
    return { mode: "external", urls: externalUrls };
  }

  if (environment.CI) {
    return {
      mode: "direct",
      urls: {
        admin: environment.E2E_ADMIN_URL ?? directApplicationUrls.admin,
        api: environment.E2E_API_URL ?? directApplicationUrls.api,
        web: environment.E2E_WEB_URL ?? directApplicationUrls.web,
      },
    };
  }

  return {
    mode: "portless",
    urls: {
      admin:
        environment.E2E_ADMIN_URL ??
        getPortlessUrl(portlessApplicationNames.admin),
      api:
        environment.E2E_API_URL ?? getPortlessUrl(portlessApplicationNames.api),
      web:
        environment.E2E_WEB_URL ?? getPortlessUrl(portlessApplicationNames.web),
    },
  };
};
