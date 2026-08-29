@registration @admin
Feature: Registration review
  Registration reviewers can decide whether a company may continue onboarding.

  Scenario: A Registration reviewer approves a company
    Given a Registration exists for "Analytical Engines"
    And "Grace Hopper" is a Registration reviewer
    And I am logged in as "Grace Hopper"
    When I approve the Registration for "Analytical Engines"
    Then the Registration for "Analytical Engines" is awaiting onboarding
