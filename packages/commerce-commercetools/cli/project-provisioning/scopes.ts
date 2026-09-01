import type { ProjectKey } from "./model";

const scopeFor = (name: string, projectKey: ProjectKey) =>
  `${name}:${projectKey}`;

export const missingBootstrapScopes = (
  projectKey: ProjectKey,
  scopes: readonly string[]
): readonly string[] => {
  const manageApiClients = scopeFor("manage_api_clients", projectKey);
  const canManageProjectSettings = [
    scopeFor("manage_project_settings", projectKey),
    scopeFor("manage_project", projectKey),
  ].some((scope) => scopes.includes(scope));

  return [
    ...(scopes.includes(manageApiClients) ? [] : [manageApiClients]),
    ...(canManageProjectSettings
      ? []
      : [scopeFor("manage_project_settings", projectKey)]),
  ];
};

export const RUNTIME_SCOPE_NAMES = [
  "view_states",
  "manage_products",
  "view_quotes",
  "view_attribute_groups",
  "manage_orders",
  "manage_business_units",
  "manage_checkout_payment_intents",
  "manage_customers",
  "manage_approval_flows",
  "manage_approval_rules",
  "view_customer_groups",
  "manage_quotes",
  "view_sessions",
  "view_discount_codes",
  "view_stores",
  "view_connectors_deployments",
  "view_cart_discounts",
  "view_products",
  "view_order_edits",
  "view_shopping_lists",
  "manage_payments",
  "view_standalone_prices",
  "view_payments",
  "manage_sessions",
  "view_orders",
  "manage_types",
  "manage_states",
  "manage_shopping_lists",
  "manage_shipping_methods",
  "manage_tax_categories",
  "manage_zones",
  "view_shipping_methods",
  "view_connectors",
  "manage_recurring_orders",
  "manage_key_value_documents",
  "view_types",
  "view_messages",
  "view_customers",
  "view_categories",
  "view_business_units",
  "view_tax_categories",
  "create_anonymous_token",
  "view_product_selections",
  "view_associate_roles",
  "manage_order_edits",
  "view_staged_quotes",
  "view_project_settings",
  "view_recurring_orders",
  "view_quote_requests",
  "manage_quote_requests",
] as const;

export const runtimeScopeFor = (projectKey: ProjectKey): string =>
  RUNTIME_SCOPE_NAMES.map((name) => `${name}:${projectKey}`).join(" ");
