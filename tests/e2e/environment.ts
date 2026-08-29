import path from "node:path";

import nextEnvironment from "@next/env";
import type { E2EApplicationUrls } from "@repo/e2e-testing";

const { loadEnvConfig, resetEnv } = nextEnvironment;

type Environment = Readonly<Record<string, string | undefined>>;
type RuntimeEnvironment = Record<string, string>;

interface ApplicationEnvironments {
  readonly admin: Environment;
  readonly api: Environment;
  readonly web: Environment;
}

interface ComposeE2EEnvironmentsInput {
  readonly applications: ApplicationEnvironments;
  readonly explicitEnvironment: Environment;
}

export interface E2EEnvironments {
  readonly runner: RuntimeEnvironment;
  readonly servers: {
    readonly admin: RuntimeEnvironment;
    readonly api: RuntimeEnvironment;
    readonly web: RuntimeEnvironment;
  };
}

export const withE2EApplicationUrls = (
  environments: E2EEnvironments,
  urls: E2EApplicationUrls
): E2EEnvironments => ({
  runner: environments.runner,
  servers: {
    admin: {
      ...environments.servers.admin,
      NEXT_PUBLIC_API_URL: urls.api,
    },
    api: {
      ...environments.servers.api,
      ADMIN_URL: urls.admin,
      NEXT_PUBLIC_API_URL: urls.api,
      NEXT_PUBLIC_WEB_URL: urls.web,
    },
    web: {
      ...environments.servers.web,
      NEXT_PUBLIC_API_URL: urls.api,
      NEXT_PUBLIC_WEB_URL: urls.web,
    },
  },
});

const adminWorkosEnvironmentNames = {
  ADMIN_WORKOS_ACCESS_TOKEN_ISSUER: "WORKOS_ACCESS_TOKEN_ISSUER",
  ADMIN_WORKOS_API_HOSTNAME: "WORKOS_API_HOSTNAME",
  ADMIN_WORKOS_API_HTTPS: "WORKOS_API_HTTPS",
  ADMIN_WORKOS_API_KEY: "WORKOS_API_KEY",
  ADMIN_WORKOS_API_PORT: "WORKOS_API_PORT",
  ADMIN_WORKOS_CLIENT_ID: "WORKOS_CLIENT_ID",
  ADMIN_WORKOS_COOKIE_DOMAIN: "WORKOS_COOKIE_DOMAIN",
  ADMIN_WORKOS_COOKIE_MAX_AGE: "WORKOS_COOKIE_MAX_AGE",
  ADMIN_WORKOS_COOKIE_NAME: "WORKOS_COOKIE_NAME",
  ADMIN_WORKOS_COOKIE_PASSWORD: "WORKOS_COOKIE_PASSWORD",
  ADMIN_WORKOS_COOKIE_SAMESITE: "WORKOS_COOKIE_SAMESITE",
  NEXT_PUBLIC_ADMIN_WORKOS_REDIRECT_URI: "NEXT_PUBLIC_WORKOS_REDIRECT_URI",
} as const;
const adminClerkEnvironmentNames = {
  ADMIN_CLERK_AUTHORIZED_PARTIES: "CLERK_AUTHORIZED_PARTIES",
  ADMIN_CLERK_JWT_KEY: "CLERK_JWT_KEY",
  ADMIN_CLERK_PUBLISHABLE_KEY: "NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY",
  ADMIN_CLERK_SECRET_KEY: "CLERK_SECRET_KEY",
} as const;
const adminAuthEnvironmentNames = {
  ...adminClerkEnvironmentNames,
  ...adminWorkosEnvironmentNames,
};
const providerEnvironmentNames = new Set<string>(
  Object.values(adminAuthEnvironmentNames)
);

const definedEnvironment = (environment: Environment): RuntimeEnvironment =>
  Object.fromEntries(
    Object.entries(environment).filter(
      (entry): entry is [string, string] => entry[1] !== undefined
    )
  );

const serverEnvironment = (
  applicationEnvironment: Environment,
  explicitEnvironment: Environment
) => ({
  ...definedEnvironment(applicationEnvironment),
  ...definedEnvironment(explicitEnvironment),
});

const isRunnerEnvironmentName = (name: string): boolean =>
  name.startsWith("ADMIN_CLERK_") ||
  name.startsWith("ADMIN_WORKOS_") ||
  name.startsWith("CLERK_") ||
  name.startsWith("COMMERCETOOLS_") ||
  name.startsWith("NEXT_PUBLIC_CLERK_") ||
  name.startsWith("WORKOS_") ||
  name === "COMPANY_MEMBER_INVITATION_CONTAINER" ||
  name === "REGISTRATION_CONTAINER";

const runnerEnvironment = (
  explicitEnvironment: Environment,
  applications: Pick<ApplicationEnvironments, "api" | "web">
): RuntimeEnvironment => {
  const merged = definedEnvironment(explicitEnvironment);
  const owners = new Map<string, string>();

  for (const [application, environment] of [
    ["web", applications.web],
    ["api", applications.api],
  ] as const) {
    for (const [name, value] of Object.entries(environment)) {
      if (
        value === undefined ||
        explicitEnvironment[name] !== undefined ||
        !isRunnerEnvironmentName(name)
      ) {
        continue;
      }

      const owner = owners.get(name);
      if (owner !== undefined && merged[name] !== value) {
        throw new Error(
          `${name} has conflicting values in ${owner} and ${application} runtime environments`
        );
      }

      merged[name] = value;
      owners.set(name, application);
    }
  }

  return merged;
};

const e2eRunnerEnvironment = (
  explicitEnvironment: Environment,
  applications: ApplicationEnvironments
): RuntimeEnvironment => {
  const environment = runnerEnvironment(explicitEnvironment, applications);

  for (const [runnerName, adminRuntimeName] of Object.entries(
    adminAuthEnvironmentNames
  )) {
    if (environment[runnerName] !== undefined) {
      continue;
    }
    const value = applications.admin[adminRuntimeName];
    if (value !== undefined) {
      environment[runnerName] = value;
    }
  }

  return environment;
};

const adminServerEnvironment = (
  explicitEnvironment: Environment,
  applications: ApplicationEnvironments
): RuntimeEnvironment => {
  const adminEnvironment = Object.fromEntries(
    Object.entries(
      serverEnvironment(applications.admin, explicitEnvironment)
    ).filter(([name]) => !providerEnvironmentNames.has(name))
  );

  for (const [adminName, runtimeName] of Object.entries(
    adminAuthEnvironmentNames
  )) {
    const value =
      explicitEnvironment[adminName] ??
      applications.admin[runtimeName] ??
      applications.api[adminName];

    if (value !== undefined) {
      adminEnvironment[runtimeName] = value;
    }
  }

  return adminEnvironment;
};

export const composeE2EEnvironments = ({
  applications,
  explicitEnvironment,
}: ComposeE2EEnvironmentsInput): E2EEnvironments => ({
  runner: e2eRunnerEnvironment(explicitEnvironment, applications),
  servers: {
    admin: adminServerEnvironment(explicitEnvironment, applications),
    api: serverEnvironment(applications.api, explicitEnvironment),
    web: serverEnvironment(applications.web, explicitEnvironment),
  },
});

export const loadE2EEnvironments = (workspaceRoot: string): E2EEnvironments => {
  const explicitEnvironment = { ...process.env };
  const nodeEnvironment = process.env.NODE_ENV;
  const applicationDirectories = {
    admin: path.resolve(workspaceRoot, "apps/admin"),
    api: path.resolve(workspaceRoot, "apps/api"),
    web: path.resolve(workspaceRoot, "apps/web"),
  };

  let applicationEnvironments: ApplicationEnvironments;
  const mutableProcessEnvironment: Record<string, string | undefined> =
    process.env;
  mutableProcessEnvironment.NODE_ENV = "development";
  try {
    applicationEnvironments = {
      admin:
        loadEnvConfig(applicationDirectories.admin, true, console, true)
          .parsedEnv ?? {},
      api:
        loadEnvConfig(applicationDirectories.api, true, console, true)
          .parsedEnv ?? {},
      web:
        loadEnvConfig(applicationDirectories.web, true, console, true)
          .parsedEnv ?? {},
    };
  } finally {
    resetEnv();
    if (nodeEnvironment === undefined) {
      delete mutableProcessEnvironment.NODE_ENV;
    } else {
      mutableProcessEnvironment.NODE_ENV = nodeEnvironment;
    }
  }

  return composeE2EEnvironments({
    applications: applicationEnvironments,
    explicitEnvironment,
  });
};
