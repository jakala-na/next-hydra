@search @commerce @web @smoke
Feature: Product search and listing
  Buyers can find Products available in their current Store and refine Product listings without losing shareable navigation state.

  Background:
    Given Product search uses Store "default-store" with locale "en-US" and currency "USD"
    And the searchable Product Catalog contains:
      | Product                          | Category   | Starting price | Availability |
      | A789 BC Deep Mining Excavator   | Excavators | 16500.00       | In stock     |
      | A790 Compact Excavator          | Excavators | 12500.00       | In stock     |
      | L120 Wheel Loader               | Loaders    | 18000.00       | Out of stock |

  Scenario: Refine the Products Page and return to the same listing state
    Given a buyer is viewing the Products Page
    Then the Product listing shows starting prices:
      | Product                        | Price starts at |
      | A789 BC Deep Mining Excavator | $16,500.00      |
      | A790 Compact Excavator        | $12,500.00      |
      | L120 Wheel Loader             | $18,000.00      |
    Then the Product listing sidebar offers facets:
      | Facet        |
      | Category     |
      | Availability |
      | Price        |
    And the Category facet initially shows 5 values
    When the buyer shows more Category values
    Then additional Category values are shown
    When the buyer refines the Product listing with:
      | Facet        | Value       |
      | Category     | Excavators  |
      | Category     | Loaders     |
      | Availability | In stock    |
    And the buyer sorts the Product listing by "Price: Low to High"
    Then the Product listing shows Products in order:
      | Product                        |
      | A790 Compact Excavator        |
      | A789 BC Deep Mining Excavator |
    And the current URL is "/products?category=excavators&category=loaders&availability=in-stock&sort=price-asc"
    When the buyer opens Product "A790 Compact Excavator" and returns to the Products Page
    Then the Product listing keeps the selected facets and sort order
