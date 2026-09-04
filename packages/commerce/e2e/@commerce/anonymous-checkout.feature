@commerce @checkout @web @smoke
Feature: Anonymous Checkout
  Anonymous buyers can start Checkout from a Product Detail Page and provide the details required to prepare their Cart for delivery.

  Scenario: An anonymous buyer selects a priced Shipping Option for a planned Delivery Group
    Given Store "default-store" serves locale "en-US" in currency "USD"
    And deliveries to "US" have Shipping Options:
      | Shipping Option          | Price  | Currency |
      | Standard shipping method | 100.00 | USD      |
    And Product "A789 BC Deep Mining Excavator" has an available Product Variant in Store "default-store" priced at "16500.00" in currency "USD" with attributes:
      | Attribute | Value |
      | Model     | 2015  |
    When an anonymous buyer visits the PDP for Product "A789 BC Deep Mining Excavator"
    And the buyer selects the Product Variant with attributes:
      | Attribute | Value |
      | Model     | 2015  |
    And the buyer adds 1 unit of the selected Product Variant to their Cart
    Then the Cart is open with 1 unit of Product "A789 BC Deep Mining Excavator"
    And Product "A789 BC Deep Mining Excavator" is identified by "Model: 2015" in the Cart
    And the Cart subtotal is "16500.00" in currency "USD"
    When the buyer proceeds from the Cart to "Checkout"
    Then the "Checkout" Cart summary contains 1 unit of Product "A789 BC Deep Mining Excavator"
    And the "Checkout" Cart subtotal is "16500.00" in currency "USD"
    And the Checkout Steps have statuses:
      | Step             | Status     |
      | Contact          | Active     |
      | Delivery Details | Incomplete |
      | Shipping Options | Incomplete |
      | Payment Options  | Incomplete |
      | Review Order     | Incomplete |
    When the buyer enters and saves Contact details:
      | Field      | Value                         |
      | Email      | checkout-baseline@example.com |
      | First name | Checkout                      |
      | Last name  | Baseline                      |
      | Phone      | +15550101234                  |
    Then the Checkout Steps have statuses:
      | Step             | Status   |
      | Contact          | Complete |
      | Delivery Details | Active   |
    When the buyer enters and saves Delivery Details:
      | Field          | Value           |
      | Address line 1 | 123 Test Street |
      | Address line 2 | Suite 1         |
      | City           | Testville       |
      | Postal code    | 10001           |
      | Region         | NY              |
      | Country        | US              |
    Then the Checkout Steps have statuses:
      | Step             | Status   |
      | Contact          | Complete |
      | Delivery Details | Complete |
      | Shipping Options | Active   |
    And Shipping Options presents a Delivery Plan with targets:
      | Delivery Group | Product                       | Quantity |
      | Delivery 1     | A789 BC Deep Mining Excavator | 1        |
    And Delivery Group "Delivery 1" offers Shipping Options:
      | Shipping Option  | Price | Currency |
      | Standard shipping | 0.00  | USD      |
    When the buyer selects Shipping Option "Standard shipping" for Delivery Group "Delivery 1"
    And the buyer saves Shipping Options
    Then the Checkout Steps have statuses:
      | Step             | Status   |
      | Shipping Options | Complete |
      | Payment Options  | Active   |
    And Delivery Group "Delivery 1" has selected Shipping Option "Standard shipping method" priced at "0.00" in currency "USD"
    And the "Checkout" Cart subtotal is "16500.00" in currency "USD"

  Scenario: Editing Delivery Details from Checkout Steps invalidates saved Shipping and Payment Options
    Given Store "default-store" serves locale "en-US" in currency "USD"
    And deliveries to "US" have Shipping Options:
      | Shipping Option          | Price  | Currency |
      | Standard shipping method | 100.00 | USD      |
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
      | Field      | Value                      |
      | Email      | address-change@example.com |
      | First name | Address                    |
      | Last name  | Change                     |
      | Phone      | +15550101234               |
    And the buyer enters and saves Delivery Details:
      | Field          | Value            |
      | Address line 1 | 123 First Street |
      | Address line 2 |                  |
      | City           | Testville        |
      | Postal code    | 10001            |
      | Region         | NY               |
      | Country        | US               |
    And the buyer selects Shipping Option "Standard shipping" for Delivery Group "Delivery 1"
    And the buyer saves Shipping Options
    Then Payment Options offers Payment Methods:
      | Payment Method | Availability |
      | Card           | Available    |
    When the buyer enters valid Card details and uses the Shipping Address for Billing
    And the buyer saves Payment Options
    When the buyer edits the "Delivery Details" step
    And the buyer enters and saves Delivery Details:
      | Field          | Value             |
      | Address line 1 | 456 Second Street |
      | Address line 2 | Suite 2           |
      | City           | Testville         |
      | Postal code    | 10001             |
      | Region         | NY                |
      | Country        | US                |
    Then the Checkout Steps have statuses:
      | Step             | Status     |
      | Delivery Details | Complete   |
      | Shipping Options | Active     |
      | Payment Options  | Incomplete |
    And Delivery Group "Delivery 1" offers Shipping Options:
      | Shipping Option  | Price | Currency |
      | Standard shipping | 0.00  | USD      |
    And no selected Shipping Option is shown
