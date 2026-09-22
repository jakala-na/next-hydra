import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { Schema } from "effect";

type Environment = Readonly<Record<string, string | undefined>>;

interface ResolveE2EApplicationRoutingInput {
  readonly environment: Environment;
  readonly getPortlessUrl: (name: string) => string;
  readonly portlessApplicationNames: E2EApplicationNames;
}

export interface E2EApplicationNames {
  readonly admin?: string;
  readonly api?: string;
  readonly web: string;
}

export interface E2EApplicationRouting {
  readonly mode: "direct" | "external" | "portless";
  readonly urls: E2EApplicationNames;
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
): E2EApplicationNames => {
  const optionalName = (application: "admin" | "api") => {
    if (
      existsSync(path.join(workspaceRoot, "apps", application, "package.json"))
    ) {
      return loadPortlessApplicationName(workspaceRoot, application);
    }
    return undefined;
  };
  return {
    admin: optionalName("admin"),
    api: optionalName("api"),
    web: loadPortlessApplicationName(workspaceRoot, "web"),
  };
};

const directApplicationUrls = {
  admin: "http://localhost:3005",
  api: "http://localhost:3002",
  web: "http://localhost:3001",
} as const;

export const resolveE2EApplicationRouting = ({
  environment,
  getPortlessUrl,
  portlessApplicationNames: names,
}: ResolveE2EApplicationRoutingInput): E2EApplicationRouting => {
  const explicit = {
    admin: environment.E2E_ADMIN_URL,
    api: environment.E2E_API_URL,
    web: environment.E2E_WEB_URL,
  };
  const external =
    Boolean(explicit.web) &&
    (!names.api || Boolean(explicit.api)) &&
    (!names.admin || Boolean(explicit.admin));
  let mode: E2EApplicationRouting["mode"] = "portless";
  if (environment.CI) {
    mode = "direct";
  }
  if (external) {
    mode = "external";
  }
  const url = (application: keyof E2EApplicationNames, name: string) =>
    explicit[application] ??
    (mode === "direct"
      ? directApplicationUrls[application]
      : getPortlessUrl(name));
  return {
    mode,
    urls: {
      admin: names.admin ? url("admin", names.admin) : undefined,
      api: names.api ? url("api", names.api) : undefined,
      web: url("web", names.web),
    },
  };
};
