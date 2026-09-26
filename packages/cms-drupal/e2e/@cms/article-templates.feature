@cms @drupal @web
Feature: Shared article presentation
  Editors manage one presentation for articles while authors maintain each
  article's content and translations in its existing fields.

  Scenario: Publish a shared article template change
    Given the starter articles use the shared article template
    When I read two articles and a French translation
    Then each article shows its own title, summary, image, and formatted body
    And each article has one site header and one site footer
    When I preview a new shared article notice
    Then the notice appears in the template preview only
    When I publish the article template
    Then both articles show the shared notice without changes to their content

  Scenario: Preview an unpublished article through the shared template
    Given an unpublished article with a French translation
    When I preview the French article in Canvas
    Then I see the translated article through the shared template
    And visitors cannot read the unpublished article
