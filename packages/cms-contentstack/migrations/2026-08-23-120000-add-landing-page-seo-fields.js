/* oxlint-disable typescript/no-unsafe-assignment, typescript/no-unsafe-call, typescript/no-unsafe-member-access, unicorn/prefer-module -- CSDX loads CommonJS migration files and injects an untyped migration DSL. */

module.exports = function addLandingPageSeoFields({ migration }) {
  const landingPage = migration.editContentType("landing_page");

  landingPage.createField("seo_title", {
    data_type: "text",
    display_name: "SEO title",
    field_metadata: {
      description: "Optional browser and search-result title.",
    },
    mandatory: false,
    multiple: false,
    non_localizable: false,
    unique: false,
  });
  landingPage.createField("seo_description", {
    data_type: "text",
    display_name: "SEO description",
    field_metadata: {
      description: "Optional search-result description.",
      multiline: true,
    },
    mandatory: false,
    multiple: false,
    non_localizable: false,
    unique: false,
  });
  landingPage.moveField("seo_title").afterField("hide_display_title");
  landingPage.moveField("seo_description").afterField("seo_title");

  migration.addTask(landingPage.getTaskDefinition());
};
