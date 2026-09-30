@search @web @smoke
Feature: Combined Product and Resource search
  Visitors can discover Products and Resources together, then focus on one result type without losing their search.

  Background:
    Given searchable Products include several results for "excavator"
    And searchable Resources include several results for "excavator"

  Scenario: Review the most relevant results together
    Given a visitor searches for "excavator"
    Then the Search Page shows these tabs:
      | Tab       | Selected |
      | All       | Yes      |
      | Products  | No       |
      | Resources | No       |
    And the All tab previews relevant result rows from:
      | Result type |
      | Products    |
      | Resources   |
    And the All tab offers these actions:
      | Results   | Action              |
      | Products  | Show more Products  |
      | Resources | Show more Resources |

  Scenario Outline: Browse all paged results for one result type
    Given a visitor searches for "excavator"
    When the visitor chooses "<Action>" from the All tab
    Then the "<Tab>" tab is selected
    And the result rows contain only <ResultType> results
    And no facet controls are shown
    And the search URL keeps the query and active tab
    When the visitor opens the next results page
    Then another page of <ResultType> result rows is shown
    And the search URL keeps the query, active tab, and page

    Examples:
      | Action              | Tab       | ResultType |
      | Show more Products  | Products  | Product    |
      | Show more Resources | Resources | Resource   |
