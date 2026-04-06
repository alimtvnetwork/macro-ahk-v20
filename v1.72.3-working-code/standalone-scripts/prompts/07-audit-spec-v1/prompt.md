Audit the current specification set against the implemented codebase. For each spec:

1. Check if the spec accurately reflects the current implementation
2. Identify any drift between spec and code
3. Flag missing specs for implemented features
4. Flag specs for features not yet implemented
5. Score each spec on a 6-dimension rubric:
   - Completeness (25%): Are all requirements documented?
   - Consistency (25%): Do specs agree with each other?
   - Alignment (20%): Does the spec match the code?
   - Clarity (15%): Is the spec unambiguous?
   - Maintainability (10%): Is the spec easy to update?
   - Test Coverage (5%): Are acceptance criteria testable?

Output a report to `.lovable/memory/audit/` with severity and impact scores for each finding. Propose corrections for any inconsistencies found.
