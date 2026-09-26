@cms @web
Feature: Site-wide announcement
  Visitors can identify the demo and follow its announcement to learn about
  the template, whichever CMS provides the site.

  Scenario: Read the demo announcement across the site
    When I visit the homepage and the registration page
    Then each page shows one demo announcement above its header
    And the announcement links to the Next Hydra website
    And the placeholder region text is absent
