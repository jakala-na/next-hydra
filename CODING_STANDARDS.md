# Coding Standards

## Tautological Tests Considered Harmful

A test must be capable of failing when production behavior regresses. Do not add tests that merely restate the implementation and therefore prove only that the test and implementation currently contain the same value or algorithm.

Avoid tests that:

- duplicate a private constant or algorithm in the expected value;
- assert a mock's canned return value without exercising meaningful production behavior;
- compare a fixture with itself or with data derived by the same code path;
- mock away the boundary where the reported regression occurred; or
- inspect private helpers or storage details when an observable behavior or collaborator contract can be asserted instead.

Prefer tests that exercise a public API, verify an externally observable outcome, or use a realistic collaborator that enforces the downstream contract. Before keeping a test, identify a plausible production mutation that would make it fail. If none exists, the test does not provide regression protection and should be removed or rewritten.

Exact literal assertions are appropriate when the literal is itself a public or provider contract. The test should make that contract explicit rather than presenting the assertion as evidence for unrelated behavior.
