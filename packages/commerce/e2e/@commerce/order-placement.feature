@commerce @checkout @order-placement @web
Feature: Checkout Order Placement
  Buyers can place one Order from a reviewable Checkout while every authorization, capture, cancellation, and credit commitment remains recoverable from the Payment record.

  Rule: Card Order placement

    Background:
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
        | Field      | Value                       |
        | Email      | order-placement@example.com |
        | First name | Order                       |
        | Last name  | Buyer                       |
        | Phone      | +15550101234                |
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

    Scenario: A repeated Card Place Order request creates one Order and one capture
      When the buyer enters valid Card details and uses the Shipping Address for Billing
      And the buyer saves Payment Options
      And the buyer submits Place Order twice for the same Checkout
      And the consumed Checkout Cart cookie is cleared
      Then Order Confirmation shows one Order for "17000.00" in currency "USD"
      And Order Confirmation shows Payment Method "Visa ending in 4242"
      And the Card Payment records transactions:
        | Transaction   | State   |
        | Authorization | Success |
        | Charge        | Success |
      And Stripe has one authorization and one capture for the Order

    Scenario: Cancelled Card authentication invalidates the saved Card selection
      When the buyer enters Card details that require additional authentication and uses the Shipping Address for Billing
      And the buyer saves Payment Options
      And the buyer places the Order
      Then Card authentication is required before the Order is created
      When the buyer cancels Card authentication
      And the buyer retries Place Order
      Then the buyer cannot place an Order until Card Payment Options are saved again
      And no Order exists for the Checkout
      And the Card Payment records transactions:
        | Transaction   | State   |
        | Authorization | Failure |
      And the Card Payment has no Charge transaction

    Scenario: A rejected Order releases its successful Card authorization
      When the buyer enters valid Card details and uses the Shipping Address for Billing
      And the buyer saves Payment Options
      And Order placement will be rejected after Payment Authorization
      And the buyer places the Order
      Then the buyer remains on Review Order with the Order rejection
      And no Order exists for the Checkout
      And the Card Payment records transactions:
        | Transaction        | State   |
        | Authorization      | Success |
        | CancelAuthorization | Success |
      And the Card Payment has no Charge transaction
      When the buyer retries Place Order
      Then the buyer cannot place an Order until Card Payment Options are saved again
      And no Order exists for the Checkout

    Scenario: A failed Card capture remains visible after the Order is created
      When the buyer enters Card details that fail during capture and uses the Shipping Address for Billing
      And the buyer saves Payment Options
      And the buyer places the Order
      Then Order Confirmation shows one Order for "17000.00" in currency "USD"
      And Order Confirmation shows that Payment finalization is pending
      And the Card Payment records transactions:
        | Transaction   | State   |
        | Authorization | Success |
        | Charge        | Failure |

    Scenario: An uncertain Order creation response is recovered before Card capture
      When the buyer enters valid Card details and uses the Shipping Address for Billing
      And the buyer saves Payment Options
      And Order creation will succeed without returning its response
      And the buyer places the Order
      And the buyer refreshes Checkout
      Then Order Confirmation shows one Order for "17000.00" in currency "USD"
      And the Card Payment records transactions:
        | Transaction   | State   |
        | Authorization | Success |
        | Charge        | Success |
      And Stripe has one authorization and one capture for the Order

  Rule: Net Terms Order placement

    Scenario: A Company Member places a Net 30 Order and consumes available credit
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
      And the buyer selects Payment Method "Net 30" and uses the Shipping Address for Billing
      And the buyer saves Payment Options
      And the buyer places the Order
      Then Order Confirmation shows one Order for "17000.00" in currency "USD"
      And Order Confirmation shows Payment Method "Net 30"
      And the Net 30 Payment records transactions:
        | Transaction   | State   |
        | Authorization | Success |
        | Charge        | Success |
      And Company "Analytical Engines" has a "17000.00" ledger debit in currency "USD" for the Order
      And Company "Analytical Engines" has "3000.00" available to spend in currency "USD"
