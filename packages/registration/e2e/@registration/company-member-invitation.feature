@registration @company-member-invitation @web @smoke
Feature: Company Member Invitations
  Company administrators can invite people to join their company with specific Company Roles.

  Rule: A Company Member Invitation offers one or more Company Roles

    Scenario: A company administrator invites a new company member
      Given "Ada Lovelace" is a Company Member of "Analytical Engines" with the "Admin" role
      And I am logged in as "Ada Lovelace"
      When I am on the Manage Users page
      And I invite "Grace Hopper" with the "Buyer" and "Approver" roles
      Then a pending Company Member Invitation is shown for "Grace Hopper"
      And the invitation offers the "Buyer" and "Approver" roles
