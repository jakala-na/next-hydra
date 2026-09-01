@commerce @checkout @web @smoke
Feature: Checkout Payment Options
  Buyers can prepare and save an available Payment Method without authorizing funds or consuming company credit before they place the Order.

  @anonymous
  Scenario: An anonymous buyer saves Card and reaches Review Order without authorization
    Given Store "default-store" serves locale "en-US" in currency "USD"
    And deliveries to "US" have Shipping Options:
      | Shipping Option | Price  | Currency |
      | Standard        | 500.00 | USD      |
    And Product "A789 BC Deep Mining Excavator" has an available Product Variant in Store "default-store" priced at "16500.00" in currency "USD" with attributes:
      | Attribute | Value |
      | Model     | 2015  |
    When an anonymous buyer visits the PDP for Product "A789 BC Deep Mining Excavator"
    And the buyer selects the Product Variant with attributes:
      | Attribute | Value |
      | Model     | 2015  |
    And the buyer adds 1 unit of the selected Product Variant to their Cart
    And the buyer proceeds from the Cart to "Checkout"
    And the buyer enters and saves Contact details:
      | Field      | Value                    |
      | Email      | card-checkout@example.com |
      | First name | Card                     |
      | Last name  | Buyer                    |
      | Phone      | +15550101234             |
    And the buyer enters and saves Delivery Details:
      | Field          | Value           |
      | Address line 1 | 123 Test Street |
      | Address line 2 | Suite 1         |
      | City           | Testville       |
      | Postal code    | 10001           |
      | Region         | NY              |
      | Country        | US              |
    And the buyer selects Shipping Option "Standard" for Delivery Group "Delivery 1"
    And the buyer saves Shipping Options
    Then Payment Options offers Payment Methods:
      | Payment Method | Availability |
      | Card           | Available    |
    When the buyer enters valid Card details and uses the Shipping Address for Billing
    And the buyer saves Payment Options
    Then the Checkout Steps have statuses:
      | Step            | Status   |
      | Payment Options | Complete |
      | Review Order    | Active   |
    And Review Order shows Payment Method "Card" with planned amount "17000.00" in currency "USD"
    And the Card Payment has not been authorized

  @authenticated
  Scenario: A Company Member saves Net 30 without consuming credit before Order placement
    Given Store "default-store" serves locale "en-US" in currency "USD"
    And deliveries to "US" have Shipping Options:
      | Shipping Option | Price  | Currency |
      | Standard        | 500.00 | USD      |
    And Product "A789 BC Deep Mining Excavator" has an available Product Variant in Store "default-store" priced at "16500.00" in currency "USD" with attributes:
      | Attribute | Value |
      | Model     | 2015  |
    And "Ada Lovelace" is a Company Member of "Analytical Engines" with the "Buyer" role
    And Company "Analytical Engines" has Net 30 with "20000.00" available to spend in currency "USD"
    And I am logged in as "Ada Lovelace"
    When Customer "Ada Lovelace" visits the PDP for Product "A789 BC Deep Mining Excavator"
    And the buyer selects the Product Variant with attributes:
      | Attribute | Value |
      | Model     | 2015  |
    And the buyer adds 1 unit of the selected Product Variant to their Cart
    And the buyer proceeds from the Cart to "Checkout"
    And Customer "Ada Lovelace" uses their Profile for "Contact"
    And "Delivery Details" offers the default Shipping Address for Company "Analytical Engines":
      | Field          | Value     |
      | Address line 1 | 1 E2E Way |
      | Address line 2 |           |
      | City           | New York  |
      | Postal code    | 10001     |
      | Region         | NY        |
      | Country        | US        |
    And Customer "Ada Lovelace" selects that Shipping Address and saves "Delivery Details"
    And the buyer selects Shipping Option "Standard" for Delivery Group "Delivery 1"
    And the buyer saves Shipping Options
    Then Payment Options offers Payment Methods:
      | Payment Method | Availability |
      | Card           | Available    |
      | Net 30         | Available    |
    And Net 30 shows "20000.00" available to spend in currency "USD"
    When the buyer selects Payment Method "Net 30" and uses the Shipping Address for Billing
    And the buyer saves Payment Options
    Then the Checkout Steps have statuses:
      | Step            | Status   |
      | Payment Options | Complete |
      | Review Order    | Active   |
    And Review Order shows Payment Method "Net 30" with planned amount "17000.00" in currency "USD"
    And Company "Analytical Engines" still has "20000.00" available to spend in currency "USD"

  @authenticated
  Scenario: Net 30 is unavailable when the Order amount exceeds available credit
    Given Store "default-store" serves locale "en-US" in currency "USD"
    And deliveries to "US" have Shipping Options:
      | Shipping Option | Price  | Currency |
      | Standard        | 500.00 | USD      |
    And Product "A789 BC Deep Mining Excavator" has an available Product Variant in Store "default-store" priced at "16500.00" in currency "USD" with attributes:
      | Attribute | Value |
      | Model     | 2015  |
    And "Ada Lovelace" is a Company Member of "Analytical Engines" with the "Buyer" role
    And Company "Analytical Engines" has Net 30 with "16000.00" available to spend in currency "USD"
    And I am logged in as "Ada Lovelace"
    When Customer "Ada Lovelace" visits the PDP for Product "A789 BC Deep Mining Excavator"
    And the buyer selects the Product Variant with attributes:
      | Attribute | Value |
      | Model     | 2015  |
    And the buyer adds 1 unit of the selected Product Variant to their Cart
    And the buyer proceeds from the Cart to "Checkout"
    And Customer "Ada Lovelace" uses their Profile for "Contact"
    And "Delivery Details" offers the default Shipping Address for Company "Analytical Engines":
      | Field          | Value     |
      | Address line 1 | 1 E2E Way |
      | Address line 2 |           |
      | City           | New York  |
      | Postal code    | 10001     |
      | Region         | NY        |
      | Country        | US        |
    And Customer "Ada Lovelace" selects that Shipping Address and saves "Delivery Details"
    And the buyer selects Shipping Option "Standard" for Delivery Group "Delivery 1"
    And the buyer saves Shipping Options
    Then Payment Options offers Payment Methods:
      | Payment Method | Availability |
      | Card           | Available    |
      | Net 30         | Unavailable  |
    And Net 30 shows "16000.00" available to spend in currency "USD"
    And the buyer cannot select Payment Method "Net 30"
