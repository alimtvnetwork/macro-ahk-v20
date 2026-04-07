# 06 — Unit Test Failing

**Sequence:** 06  
**Name:** Unit Test Failing

---

## Prompt Text

### Format 1: Proofread Verbatim Prompt

Fix these, and when fixing failing tests, do the following:

1. Check the code.
2. Check the actual method code.
3. Check the logical implementation of the test.
4. Check the test case.
5. Fix it logically, either in the actual implementation or in the test, depending on the logical analysis.

Write it in:

/spec/05-failing-tests/{seq}-failing-test-name

Also write the root cause and solution in an .md file.

---

### Format 2: Structured and Expanded Actionable Prompt

#### Primary Instruction

Use the following as the main instruction and preserve its intent exactly:

"Fix these, and when fixing failing tests, do the following:

1. Check the code.
2. Check the actual method code.
3. Check the logical implementation of the test.
4. Check the test case.
5. Fix it logically, either in the actual implementation or in the test, depending on the logical analysis.

Write it in:

/spec/05-failing-tests/{seq}-failing-test-name

Also write the root cause and solution in an .md file."

#### Task Objective

Review and fix failing tests by analyzing both the implementation and the test logic. Do not assume the test is correct and do not assume the implementation is correct. Determine which side is logically wrong, fix it accordingly, and document the findings clearly.

#### Required Review Process

For every failing test, follow this exact review process:

1. Check the related source code.
   1. Inspect the surrounding implementation.
   2. Understand the intended behavior from the method logic.
   3. Verify whether the existing implementation matches the expected behavior.

2. Check the actual method code.
   1. Identify the exact method or function under test.
   2. Read the real implementation in full, not just the failing line.
   3. Confirm input handling, output behavior, edge cases, exceptions, and side effects.

3. Check the logical implementation of the test.
   1. Understand what behavior the test is trying to validate.
   2. Verify whether the assertion logic is correct.
   3. Check whether the test expectation matches the business or technical intent.
   4. Detect false assumptions, brittle assertions, bad mocks, incorrect fixtures, or unrealistic expectations.

4. Check the full test case.
   1. Review setup, execution, assertion, teardown, and any mocks or stubs.
   2. Confirm whether the test name accurately reflects the scenario.
   3. Check for environment issues, ordering issues, async timing issues, state leakage, or dependency issues.

5. Fix logically.
   1. If the implementation is wrong, fix the implementation.
   2. If the test is wrong, fix the test.
   3. If both are partially wrong, fix both with clear justification.
   4. Do not make a change just to pass the test.
   5. Every fix must be based on logical correctness and intended behavior.

#### Output and Documentation Requirement

For each failing test, create a markdown file in the following path:

/spec/05-failing-tests/{seq}-failing-test-name

The file must contain the root cause and the solution.

#### Required Markdown File Structure

Each failing test document should include these sections:

1. Test name
2. Failing area
3. Related source method or module
4. Observed failure
5. Root cause
6. Whether the issue was in the implementation, the test, or both
7. Fix applied
8. Reasoning behind the fix
9. Any edge cases considered
10. Final expected behavior
11. Acceptance criteria

#### Suggested Markdown Template

```markdown
# Failing Test Analysis

## Test Name
[Write the failing test name]

## Sequence
[Write the sequence number used in the filename]

## Failing Area
[Module, service, component, utility, or feature area]

## Related Method or Code Path
[Method name, class name, file path, or logical execution path]

## Observed Failure
[Describe the failing assertion, error, mismatch, or unexpected behavior]

## Root Cause
[Explain the actual reason for the failure]

## Logical Analysis
[Explain whether the implementation was wrong, the test was wrong, or both]

## Fix Applied
[Describe the exact correction made]

## Reasoning
[Explain why this fix is logically correct]

## Edge Cases Reviewed
[List any edge cases, exception cases, or related scenarios checked]

## Final Expected Behavior
[Describe the corrected expected behavior after the fix]

## Acceptance Criteria
1. The failing test is understood before any fix is applied.
2. The actual method implementation is reviewed fully.
3. The test logic is reviewed fully.
4. The final fix is made on the logically incorrect side.
5. The root cause is documented clearly.
6. The solution is documented clearly.
7. The markdown file is created in the required path and naming format.
```

#### File Naming Rule

The output file path must follow this format exactly:

/spec/05-failing-tests/{seq}-failing-test-name

Rules:
1. {seq} should be a sequence number.
2. failing-test-name should be a normalized descriptive name.
3. The file should be written as a markdown file.
4. Keep naming consistent and readable.

#### Acceptance Criteria for the Overall Task

1. Every failing test is reviewed against actual source logic.
2. Every failing test is reviewed against actual test logic.
3. No fix is applied blindly just to make tests pass.
4. Root cause is identified before changing code.
5. The fix is applied to the implementation, the test, or both, based on logic.
6. Each case is documented in a markdown file under /spec/05-failing-tests/.
7. Each markdown file clearly explains both root cause and solution.

#### Optional Improvement

If helpful, also include a short summary table in each markdown file with:
1. Test name
2. Failure type
3. Root cause category
4. Fix location
5. Status
