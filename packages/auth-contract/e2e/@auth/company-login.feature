@auth @company-login @web @smoke
Feature: Company login
  Company Members can sign in and act for one of their Companies.

  Scenario: A Company Member logs in to one Company
    Given "Ada Lovelace" is a Company Member of "Analytical Engines" with the "Buyer" role
    When I log in as "Ada Lovelace"
    Then the Company switcher shows "Analytical Engines"

  Scenario: A Company Member selects one of multiple Companies
    Given "Ada Lovelace" is a Company Member of "Analytical Engines" with the "Buyer" role
    And "Ada Lovelace" is a Company Member of "Difference Engine" with the "Approver" role
    When I log in as "Ada Lovelace"
    And I select "Difference Engine" from the Company switcher
    Then the Company switcher shows "Difference Engine"
