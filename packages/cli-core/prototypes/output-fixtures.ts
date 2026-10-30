// THROWAWAY: fictional receipts based on the current command contracts.
export interface Action {
  readonly title: string;
  readonly where: string;
  readonly detail: string;
  readonly command?: string;
}

export interface Scenario {
  readonly title: string;
  readonly context: string;
  readonly command: string;
  readonly phases: readonly string[];
  readonly outcome: "ready" | "action" | "failed" | "plan";
  readonly summary: string;
  readonly facts: readonly (readonly [string, string])[];
  readonly actions: readonly Action[];
  readonly note?: string;
}

const manualContent = [
  {
    title: "Configure the Contentstack Algolia app",
    where: "Contentstack > your stack > Algolia app",
    detail:
      "Use ALGOLIA_APPLICATION_ID and ALGOLIA_CONTENT_WRITE_API_KEY from apps/cli/.env.search.local. Set the destination index to demo--content.",
  },
  {
    title: "Configure content mappings",
    where: "Contentstack > Algolia app > mappings",
    detail:
      "For each content type intended for search, match mapped fields to the Searchable attributes configured for demo--content. Include objectID, _content_type, content, environment and publish_details.locale.",
  },
  {
    title: "Run the initial content sync",
    where: "Contentstack > Algolia app",
    detail:
      "Confirm published entries appear in demo--content in Algolia. Later publish and unpublish events are handled by the app.",
  },
] as const satisfies readonly Action[];

const searchBase = {
  title: "Set up search",
  context: "Algolia / Contentstack · en-US, fr-FR · index prefix demo",
  command:
    "pnpm --filter cli cli search provision --locale en-US --locale fr-FR --index-prefix demo --output .env.search.local",
  phases: [
    "Check the credential destination",
    "Configure content and suggestion indices",
    "Create scoped search and content write keys",
    "Publish credentials to the private local file",
  ],
  outcome: "action",
  summary: "Search resources provisioned. Content indexing needs your action.",
  facts: [
    ["Content index", "demo--content"],
    ["Query Suggestions", "2 locale configurations"],
    ["Credentials", "apps/cli/.env.search.local (0600)"],
    ["Content sync", "Not started by this command"],
  ],
  actions: manualContent,
  note: "Credential values stay in the private file; they are never printed.",
} as const satisfies Scenario;

export const scenarioNames = [
  "search",
  "search-installed",
  "search-vercel",
  "cms",
  "compose",
  "failure",
  "plan",
] as const;
export type ScenarioName = (typeof scenarioNames)[number];

export const scenarios: Record<ScenarioName, Scenario> = {
  search: searchBase,
  "search-installed": {
    ...searchBase,
    command: `${searchBase.command} --install-content-search-app`,
    phases: [
      ...searchBase.phases,
      "Install and configure the Contentstack Algolia app",
    ],
    summary: "Search resources and the Contentstack app are configured.",
    facts: [
      ...searchBase.facts.slice(0, 3),
      ["Contentstack app", "Configured for demo--content"],
    ],
    actions: [manualContent[1], manualContent[2]],
  },
  "search-vercel": {
    ...searchBase,
    command:
      "pnpm --filter cli cli search provision --locale en-US --locale fr-FR --index-prefix demo --store vercel --environment preview --install-content-search-app",
    phases: [
      ...searchBase.phases.slice(0, 3),
      "Publish credentials to Vercel Preview",
      "Install and configure the Contentstack Algolia app",
    ],
    summary:
      "Search configured. Deployment, content mappings and initial sync remain.",
    facts: [
      ["Content index", "demo--content"],
      ["Credentials", "Linked web project / Vercel Preview"],
      ["Contentstack app", "Configured directly using the generated key"],
    ],
    actions: [
      {
        title: "Redeploy the web application",
        where: "Vercel > linked web project > Preview",
        detail:
          "Start a new deployment so the runtime uses the published variables.",
      },
      manualContent[1],
      manualContent[2],
    ],
    note: "Sensitive keys cannot be read back from Vercel. The app received its key directly.",
  },
  cms: {
    title: "Set up the CMS",
    context: "Contentstack · existing stack · production environment",
    command:
      "pnpm --filter cli cli cms provision --output .env.contentstack.local",
    phases: [
      "Check the destination, CLI version and existing stack",
      "Import the starter recipe (provider output streams here)",
      "Apply pending migrations",
      "Collect runtime tokens with masked Effect prompts",
      "Publish runtime credentials",
    ],
    outcome: "action",
    summary: "Stack provisioned. Configure Live Preview next.",
    facts: [
      ["Environments", "development, staging, production"],
      ["Credentials", "apps/cli/.env.contentstack.local (0600)"],
      ["Management token", "Local alias retained"],
      ["Live Preview", "Manual stack-level configuration required"],
    ],
    actions: [
      {
        title: "Set the stack-level Live Preview URLs",
        where: "Contentstack > stack settings > Live Preview",
        detail:
          "Use the local and production URLs you supplied to cms provision. The management token cannot configure these settings.",
      },
    ],
    note: "During token collection, stop progress rendering and show the dashboard task before the masked prompts.",
  },
  compose: {
    title: "Compose the application",
    context:
      "storefront-contentstack · Contentstack / WorkOS / commercetools / Algolia",
    command: "pnpm --filter create-next-hydra compose storefront-contentstack",
    phases: [
      "Resolve the selected providers and registry files",
      "Prepare and check owned files",
      "Materialize the application",
      "Reconcile dependencies",
    ],
    outcome: "action",
    summary: "Application materialized. External services still need setup.",
    facts: [
      ["Application", "workspaces/storefront-contentstack"],
      ["Dependencies", "Installed (sample receipt)"],
      ["External provisioning", "Not performed by compose"],
    ],
    actions: [
      {
        title: "Configure the selected providers",
        where: "Terminal · workspaces/storefront-contentstack",
        detail:
          "Follow each provider's setup instructions. Inspect the CMS command before supplying stack details.",
        command: "pnpm --filter cli cli cms provision --help",
      },
      {
        title: "Preview the search resources",
        where: "Terminal · workspaces/storefront-contentstack",
        detail:
          "Run after provider configuration is available. A dry run prints a plan without changing Algolia.",
        command:
          "pnpm --filter cli cli search provision --locale en-US --dry-run",
      },
    ],
  },
  failure: {
    ...searchBase,
    phases: searchBase.phases.slice(0, 2),
    outcome: "failed",
    summary:
      "Stopped while configuring Query Suggestions: network unavailable.",
    facts: [
      ["Completed", "Destination preflight; content index configured"],
      ["May be partial", "Query Suggestions configuration"],
      ["Not started", "Key creation and credential publication"],
      ["Rollback", "No automatic rollback; existing indices remain"],
    ],
    actions: [
      {
        title: "Restore access to Algolia, then rerun",
        where: "Terminal · your application root",
        detail:
          "This fixture models failure before credential publication. Rerun reconciles managed resources.",
        command: searchBase.command,
      },
    ],
    note: "Simulated failure only. No provider request or credential write was made.",
  },
  plan: {
    ...searchBase,
    command: `${searchBase.command} --dry-run`,
    phases: [],
    outcome: "plan",
    summary: "Plan only. No Algolia resources or credentials changed.",
    facts: [
      ["Content index", "demo--content"],
      ["Query Suggestions", "2 locale configurations"],
      ["Scoped keys", "Runtime search + content write"],
      ["Destination", "apps/cli/.env.search.local"],
    ],
    actions: [
      {
        title: "Apply this plan when ready",
        where: "Terminal · your application root",
        detail: "Remove --dry-run to provision these resources.",
        command: searchBase.command,
      },
    ],
    note: "Contentstack app configuration and initial sync remain manual after provisioning.",
  },
};
