@commerce @cart @web @smoke
Feature: Cart Page
  Buyers can review and manage their current Cart on a dedicated page, and return there when Checkout is no longer available.

  Scenario: Review and update a populated Cart from the Cart flyout
    Given Store "default-store" serves locale "en-US" in currency "USD"
    And Product "A789 BC Deep Mining Excavator" has an available Product Variant in Store "default-store" priced at "16500.00" in currency "USD" with attributes:
      | Attribute | Value |
      | Model     | 2015  |
    When an anonymous buyer visits the PDP for Product "A789 BC Deep Mining Excavator"
    And the buyer selects the Product Variant with attributes:
      | Attribute | Value |
      | Model     | 2015  |
    And the buyer adds 1 unit of the selected Product Variant to their Cart
    And the buyer opens the Cart page from the Cart flyout
    Then the Cart page shows a Cart Line Item:
      | Product Variant               | Configuration | Unit price   | Quantity | Line total   |
      | A789 BC Deep Mining Excavator | Model: 2015   | 16500.00 USD | 1        | 16500.00 USD |
    And the Cart page Order Summary shows:
      | Item     | Value                  |
      | Subtotal | 16500.00 USD           |
      | Shipping | Calculated at checkout |
      | Total    | 16500.00 USD           |
    And the Cart page offers "Proceed to Checkout"
    When the buyer changes the Cart Line Item quantity to 2 on the Cart page
    Then the Cart Line Item quantity is 2 with line total "33000.00" in currency "USD"
    And the Cart page subtotal is "33000.00" in currency "USD"

  Scenario: Open the Cart page without a current Cart
    Given Store "default-store" serves locale "en-US" in currency "USD"
    When the buyer opens the Cart page from the Cart flyout
    Then the Cart page shows "Your cart is empty"
    And the Cart page offers "Browse Products"

  Scenario: Return to the Cart after opening a Checkout that was already submitted
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
      | Field      | Value                       |
      | Email      | submitted-cart@example.com  |
      | First name | Submitted                   |
      | Last name  | Cart                        |
      | Phone      | +15550101234                |
    And the buyer enters and saves Delivery Details:
      | Field          | Value           |
      | Address line 1 | 123 Test Street |
      | Address line 2 | Suite 1         |
      | City           | Testville       |
      | Postal code    | 10001           |
      | Region         | NY              |
      | Country        | US              |
    And the buyer selects Shipping Option "Standard shipping" for Delivery Group "Delivery 1"
    And the buyer saves Shipping Options
    Then Payment Options offers Payment Methods:
      | Payment Method | Availability |
      | Card           | Available    |
    And the buyer enters valid Card details and uses the Shipping Address for Billing
    And the buyer saves Payment Options
    And the buyer places the Order
    Then Order Confirmation shows one Order for "16500.00" in currency "USD"
    When the buyer opens Checkout again
    Then the buyer is redirected to the Cart page
    And the Cart page shows "Your cart is empty"

  Scenario: Review saved Shipping Options in the Cart summary
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
      | Email      | cart-summary@example.com   |
      | First name | Cart                       |
      | Last name  | Summary                    |
      | Phone      | +15550101234               |
    And the buyer enters and saves Delivery Details:
      | Field          | Value           |
      | Address line 1 | 123 Test Street |
      | Address line 2 | Suite 1         |
      | City           | Testville       |
      | Postal code    | 10001           |
      | Region         | NY              |
      | Country        | US              |
    And the buyer selects Shipping Option "Standard shipping" for Delivery Group "Delivery 1"
    And the buyer saves Shipping Options
    When the buyer visits the Cart page
    Then the Cart page Order Summary shows:
      | Item     | Value        |
      | Subtotal | 16500.00 USD |
      | Shipping | 0.00 USD     |
      | Total    | 16500.00 USD |

  Scenario Outline: Treat a missing or legacy-incompatible Cart as an empty Cart
    Given Store "default-store" serves locale "en-US" in currency "USD"
    And the anonymous buyer's Cart is "<cart condition>"
    When the buyer visits the Cart page
    Then the Cart page shows "Your cart is empty"

    Examples:
      | cart condition                           |
      | missing                                  |
      | incompatible with current Checkout rules |
      | owned by a customer                      |
