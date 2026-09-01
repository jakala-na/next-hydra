@commerce @checkout @authenticated @web @smoke
Feature: Authenticated Checkout
  Authenticated Company Members can use their Customer Profile and Company Address Book to prepare a Cart for delivery.

  Scenario: A Company Member progresses from a PDP to Shipping Options
    Given Store "default-store" serves locale "en-US" in currency "USD"
    And Product "A789 BC Deep Mining Excavator" has an available Product Variant in Store "default-store" priced at "16500.00" in currency "USD" with attributes:
      | Attribute | Value |
      | Model     | 2015  |
    And "Ada Lovelace" is a Company Member of "Analytical Engines" with the "Buyer" role
    And I am logged in as "Ada Lovelace"
    When Customer "Ada Lovelace" visits the PDP for Product "A789 BC Deep Mining Excavator"
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
    And the "Contact" Step offers "Use customer profile"
    When Customer "Ada Lovelace" uses their Profile for "Contact"
    Then the Checkout Steps have statuses:
      | Step             | Status   |
      | Contact          | Complete |
      | Delivery Details | Active   |
    And "Delivery Details" offers the default Shipping Address for Company "Analytical Engines":
      | Field          | Value       |
      | Address line 1 | 1 E2E Way   |
      | Address line 2 |             |
      | City           | New York    |
      | Postal code    | 10001       |
      | Region         | NY          |
      | Country        | US          |
    When Customer "Ada Lovelace" selects that Shipping Address and saves "Delivery Details"
    Then the Checkout Steps have statuses:
      | Step             | Status   |
      | Contact          | Complete |
      | Delivery Details | Complete |
      | Shipping Options | Active   |
