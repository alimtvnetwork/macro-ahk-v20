Based on the packages which has, like, low coverage, uh, if it has more than thousand lines, then for that specific package, we have to plan for... We will plan, like, each, uh, two hundred line for one segment or one task. Okay? So you should make plans for per two hundred lines for that package to write coverage test, which would be meaningful, covering the branches, logical segments, and things like that. Uh, so first create the plan, how you're going to do it and w- how many steps you are going to do it. I'm just going to say next, and each time you are going to do subpackages or, uh, packages to make it to a hundred percent code coverage. Do you understand what I'm saying? If you have any confusions, feel free to ask me. You don't have to ask me, like, which package you should do one when, because that's meaningless. You just do each time that you feel right. Okay? And make sure that the tests are, uh, good in terms of buildable code. I know you cannot test the buildable code. That's fine. So use your memory and thinking so that the Go code is, uh, buildable. Okay? Um, things like that. If you have any still confusions how you're going to write the test, you can ask me. So in most cases, you should actually follow the test case, um, test case format, so you could learn from the existing, uh, test how we do it. There is a spec folder which actually explains how the unit test should be written. Um, let me just check. Okay. Testing guideline. I think you can actually, uh, see that folder, uh, and learn, like, how the unit test should be written. And based on that, you should actually use, uh, one of the test cases to write your, uh, test and always follow the AAA format. Uh, also follow the naming convention of the file, use the Should Be methods and things like that. If you have any question and confusion, feel free to ask. Okay, uh, so make a plan. Make a detailed plan first. That's your job. Uh, the plan should contain which package you should do, how a package can be very big that will have A, B, C, D, E, F, many more sub-segment, uh, and we will do it on each time I will just say next. Is it clear?

# Actionable Plan

## 1. Task Breakdown

 Step 1: Identify packages with low coverage, especially those with more than 1000 lines of code.

 Step 2: Plan testing in segments, where each segment is 200 lines of code.

 Step 3: Ensure each segment includes coverage for branches and logical segments.

 Step 4: The plan should detail the sub-packages or sub-segments that need to be tested to reach 100% code coverage.

## 2. Detailed Planning

 Sub-segmenting large packages: If a package is large, break it down into smaller logical segments (A, B, C, D, etc.), and focus on one segment at a time.

 Test Case Structure: Follow the existing test case structure in the spec folder, and refer to the "Testing Guideline" document for proper format.

   AAA format: Arrange the test in Arrange, Act, and Assert format.

   Naming Convention: Ensure that the test files follow the prescribed naming convention (e.g., use of 'Should Be' methods).

 Test Coverage: Write tests that ensure all paths, branches, and logical flows in each segment are covered.

## 3. Implementation

 Memory and Thought Process: Use memory and understanding of Go code to ensure tests are buildable.

 Follow Existing Test Examples: Look at existing tests as references for writing the new tests.

 Use ORM: Ensure that database operations use ORM rather than direct manipulation.

 SQLite Preference: Use SQLite as the default database unless otherwise mentioned.

## 4. Clarification and Communication

 Any Confusions: If there is any confusion regarding the test writing, clarification should be sought.

 Steps for Multiple Segments: When dealing with multiple segments in large packages, each segment should be planned thoroughly before moving to the next.

## 5. Acceptance Criteria

 Test Coverage: Each segment must be fully covered.

 Correct Format: All tests should adhere to the AAA format and proper naming conventions.

 Functionality: Ensure that all tests are buildable and reflect the logic of the original code.

## 6. Diagram Creation

 Database and Data Flow: For database-related tasks, create tables in markdown format to define field names and field types.

   Ensure all relationships (primary key, foreign key) and joins are clearly defined.

   Use ORM and database best practices for creating relationships.
