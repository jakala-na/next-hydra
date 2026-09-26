const scopeFor = (name: string, projectKey: string): string =>
  `${name}:${projectKey}`;

export const RUNTIME_SCOPE_NAMES = [
  "view_states",
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
  "manage_shopping_lists",
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

export const runtimeScopeFor = (projectKey: string): string =>
  RUNTIME_SCOPE_NAMES.map((name) => scopeFor(name, projectKey)).join(" ");

export const missingRuntimeScopes = (
  projectKey: string,
  scope: string
): readonly string[] => {
  const grantedScopes = new Set(scope.trim().split(/\s+/u));
  if (grantedScopes.has(scopeFor("manage_project", projectKey))) {
    return [];
  }

  return RUNTIME_SCOPE_NAMES.map((name) => scopeFor(name, projectKey)).filter(
    (requiredScope) => !grantedScopes.has(requiredScope)
  );
};

export const runtimeScopeValidationMessage = (
  projectKey: string,
  missingScopes: readonly string[]
): string =>
  `must include every required Commercetools scope for project "${projectKey}" or manage_project:${projectKey}; missing: ${missingScopes.join(" ")}`;
