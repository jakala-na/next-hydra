import type { CommandReport } from "@repo/cli-core/output-model";

export function drupalProvisioningReport(directory: string): CommandReport {
  return {
    title: "CMS · Drupal",
    outcome: "action-required",
    summary:
      "The Drupal installer completed. Connect and verify the application below.",
    sections: [
      {
        title: "Provisioned",
        facts: [
          { label: "Drupal application", value: directory },
          { label: "Installer", value: "ddev install completed" },
        ],
      },
    ],
    tasks: [
      {
        id: "cms.drupal.runtime",
        title: "Configure the web application's CMS connection",
        where: "apps/web > application environment",
        detail:
          "Use the Drupal URL, viewer/previewer OAuth credentials and revalidation secret from the installer. Follow packages/cms-drupal/.env.example and packages/cms-drupal/README.md, then restart or redeploy the web application.",
        verify:
          "The web application connects to the provisioned Drupal instance.",
      },
      {
        id: "cms.drupal.verify",
        title: "Verify CMS delivery and preview",
        where: "Drupal and your web application",
        detail:
          "Publish content from the installed model and open its application URL. Use preview to check an unpublished change.",
        verify: "Published content loads and preview shows draft changes.",
      },
    ],
  };
}
