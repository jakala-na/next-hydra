@search @web @smoke
Feature: Search autocomplete
  Visitors can discover Content and Products or start a keyword search from the site header.

  Background:
    Given Product search uses Store "default-store" with locale "en-US" and currency "USD"
    And search autocomplete has these direct results:
      | Section  | Result                                    | URL                                           |
      | Content  | Choosing the right excavator for the job | /resources/choosing-the-right-excavator      |
      | Products | A789 BC Deep Mining Excavator            | /product/a789-bc-deep-mining-excavator       |
    And the Search provider returns these keyword suggestions for "excavator":
      | Keyword                  |
      | excavator attachments   |
    When a visitor enters "excavator" in the header search

  Scenario: Preview search results by type
    Then the autocomplete shows these sections in order:
      | Section  |
      | Content  |
      | Products |
      | Keywords |
    And the autocomplete offers these results:
      | Section  | Result                         |
      | Content  | Choosing the right excavator for the job |
      | Products | A789 BC Deep Mining Excavator            |
      | Keywords | Search for "excavator"         |
      | Keywords | excavator attachments          |
    And Content and Product results link to their pages

  Scenario Outline: Open a Content or Product result directly
    When the visitor chooses "<Result>" from the "<Section>" autocomplete section
    Then the browser opens the selected result page

    Examples:
      | Section  | Result                  |
      | Content  | Choosing the right excavator for the job |
      | Products | A789 BC Deep Mining Excavator            |

  Scenario: Start an All search from the exactly typed keyword
    When the visitor chooses the exactly typed keyword from autocomplete
    Then the Search Page opens with query "excavator"
    And the "All" tab is selected

  Scenario: Start an All search from a provider keyword suggestion
    When the visitor chooses "excavator attachments" from the "Keywords" autocomplete section
    Then the Search Page opens with query "excavator attachments"
    And the "All" tab is selected
