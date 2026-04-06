# Verbatim

Based on the packages that have low coverage, if a package has more than 1000 lines, then for that specific package we should split it into segments of 200 lines per task.

You should create a plan where each 200-line segment is treated as one task. Each task should focus on writing meaningful test coverage, including:
- Branch coverage
- Logical segment coverage
- Edge cases

First, create a detailed plan outlining:
- Which packages will be handled
- How many segments each package will be split into
- The step-by-step execution plan

Each time I say "next", you should proceed with the next package or segment and work towards achieving 100% code coverage.

You do not need to ask which package to prioritize. Choose based on logical ordering.

Ensure that tests are written in a way that they are buildable in Go. Even if you cannot run them, ensure correctness through reasoning.

Follow existing test patterns from the testing guideline spec folder.

Testing requirements:
- Follow AAA pattern (Arrange, Act, Assert)
- Follow naming conventions (use "Should" style naming)
- Maintain consistency with existing tests

If you have any questions or confusion, feel free to ask.

Your task now is to create a detailed execution plan.


## Structured Breakdown and Instructions


### 1. Scope Definition

1. Objective:
   a. Achieve 100% code coverage across all packages
   b. Prioritize packages with <100% coverage
   c. Segment large packages (>1000 LOC) into 200-line tasks
   d. Ensure high-quality, deterministic, and buildable Go tests


### 2. Package Classification Strategy

1. Identify all packages with <100% coverage
2. Categorize:

   a. Large Packages:
      i. LOC > 1000
      ii. Require segmentation

   b. Medium Packages:
      i. LOC 300–1000
      ii. 1–3 tasks

   c. Small Packages:
      i. LOC < 300
      ii. Single task


### 3. Segmentation Logic (Large Packages)

1. For each large package:

   a. Divide into 200-line segments
   b. Align segmentation with logical boundaries where possible

2. Example:

   PackageA (1200 LOC)
      → Segment 01: Lines 1–200
      → Segment 02: Lines 201–400
      → Segment 03: Lines 401–600
      → Segment 04: Lines 601–800
      → Segment 05: Lines 801–1000
      → Segment 06: Lines 1001–1200


### 4. Test Design Methodology

1. For each segment:

   a. Identify:
      i. Public functions
      ii. Internal logic branches
      iii. Error conditions

   b. Apply AAA Pattern:

      i. Arrange:
         - Setup inputs, mocks, dependencies

      ii. Act:
         - Execute function under test

      iii. Assert:
         - Validate outputs, state, and side effects


2. Coverage Targets:

   a. Branch coverage
   b. Error path coverage
   c. Boundary conditions
   d. Negative scenarios


### 5. Debugging and Isolation Strategy

1. Use:
   a. Stack trace reasoning
   b. Binary isolation of failing logic
   c. Controlled input reduction

2. Ensure:
   a. Deterministic tests
   b. No flaky behavior


### 6. Execution Plan (Hierarchical)

#### 1. Package Identification Phase

   a. Extract coverage report
   b. List packages <100%
   c. Rank by:
      i. Lowest coverage
      ii. Highest LOC


#### 2. Large Package Processing (>1000 LOC)

   a. For each package:

      i. Segment Definition
         A. Divide into 200-line blocks
         B. Map functions to segments

      ii. Segment Task Execution
         A. Analyze uncovered lines
         B. Identify logic branches
         C. Write tests per function

         Sub-steps:
            i. Happy path tests
            ii. Error path tests
            iii. Edge cases
            iv. Boundary validation

      iii. Validation
         A. Ensure buildable Go test code
         B. Verify naming conventions
         C. Confirm AAA compliance


#### 3. Medium Package Processing (300–1000 LOC)

   a. Break into:
      i. 2–4 logical segments

   b. Repeat:
      i. Coverage analysis
      ii. Test writing
      iii. Validation


#### 4. Small Package Processing (<300 LOC)

   a. Single-pass coverage
   b. Focus on:
      i. Missing branches
      ii. Error handling


### 7. Test Naming and Structure Rules

1. File Naming:
   a. <function>_test.go

2. Function Naming:
   a. Test<FunctionName>Should<Behavior>

3. Example:
   a. TestCreateUserShouldReturnErrorWhenInputInvalid


### 8. Iteration Flow

1. Each "next":

   a. Select:
      i. Next segment or package

   b. Perform:
      i. Coverage gap analysis
      ii. Test implementation

   c. Output:
      i. Completed segment
      ii. Remaining segments/packages


### 9. Risk Areas

1. Complex dependencies
2. Hidden side effects
3. Unhandled error paths
4. Concurrency (if present)


### 10. Ambiguities

1. Exact package list not provided
2. Coverage tool output format unknown
3. Existing test depth varies


### 11. Important

1. Always follow AAA pattern
2. Maintain Go build correctness
3. Avoid modifying production logic unless required
4. Ensure no regression
5. Keep tests deterministic and isolated


### 12. Acceptance Criteria

1. Each segment achieves full coverage
2. Tests follow naming and AAA conventions
3. All packages reach 100% coverage
4. No failing or flaky tests
5. Code remains buildable


## Remaining Tasks

1. Execute Package Identification Phase
2. Select first package (<100% coverage)
3. Begin Segment 01 (first 200 lines)
4. Continue iterative execution across all packages


## Important Instruction for Continuation

1. If tasks span multiple steps:
   a. Execute sequentially per "next" command
   b. Always continue remaining tasks
   c. Never skip unfinished tasks

If you have any questions or confusion, feel free to ask.