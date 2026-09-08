@cms @contentful @web
Feature: Contentful content rendering
  Visitors can browse published Contentful landing pages and articles rendered with the shared site components.

  Scenario: Browse a composed landing page
    Given Contentful has a published landing page for locale "en-US" with:
      | Field         | Value              |
      | Slug          | equipment           |
      | Display title | Equipment guides    |
    And the Contentful landing page contains these blocks in order:
      | Block                      | Heading                   |
      | Hero                       | Build with confidence     |
      | Featured Articles          | Latest equipment guides   |
      | Dynamic Product Collection | Recommended equipment     |
    And the Contentful hero has an internal action "Read the guide" to article "Choosing an excavator"
    And the Contentful featured articles include "Choosing an excavator"
    When a visitor opens the Contentful landing page "equipment" in locale "en-US"
    Then the landing page displays the title "Equipment guides"
    And the Contentful blocks are displayed in their configured order
    And the hero displays its tagline, description, image, and "Read the guide" action
    And featured articles displays the "Choosing an excavator" article
    And the product collection displays the heading "Recommended equipment"

  Scenario: Browse a published article
    Given Contentful has a published article "Choosing an excavator" for locale "en-US"
    When a visitor opens the Contentful article "Choosing an excavator" in locale "en-US"
    Then the article displays its title, summary, image, and publication date
    And the article displays its rich text body
