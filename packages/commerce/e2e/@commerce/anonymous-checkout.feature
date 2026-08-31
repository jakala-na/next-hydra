@commerce @checkout @web @smoke
Feature: Anonymous Checkout
  Anonymous buyers can start Checkout from a Product Detail Page and provide the details required to prepare their Cart for delivery.

  Scenario: An anonymous buyer progresses from a PDP to Shipping Options
    Given Store "default-store" serves locale "en-US" in currency "USD"
    And Product "A789 BC Deep Mining Excavator" has an available Product Variant in Store "default-store" priced at "16500.00" in currency "USD" with attributes:
      | Attribute | Value |
      | Model     | 2015  |
    When an anonymous buyer visits the PDP for Product "A789 BC Deep Mining Excavator"
    And the buyer selects the Product Variant with attributes:
      | Attribute | Value |
      | Model     | 2015  |
    And the buyer adds 1 unit of the selected Product Variant to their Cart
    Then the Cart is open with 1 unit of Product "A789 BC Deep Mining Excavator"
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
