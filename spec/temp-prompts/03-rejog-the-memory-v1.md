# 03 — Rejog the Memory v1

**Sequence:** 03  
**Name:** Rejog the Memory v1

---

## Prompt Text

### Original input (verbatim)

Can you please read the lovable memories, uh, folder, and expect the specification to redraw the old memory and try to understand the project requirements, and also just go over all the projects, and then I will give you the task, and just ask me what task that you should implement, because the specifications is there. So let's start implementing the specification. And before that, I want you to view the specification and tell me, if I give it to any AI, what are the failing chances? And create a detailed report first. Do you understand? Do you have any question, concern? Let me know.

Read what is done and what is pending in plan files (.lovable\memory\workflow), and always create files as 01-name-of-the-file.md and try to keep the folder to have smaller number of files, for plans and suggestions (.lovable/memory/suggestions) try to keep in one file and update in one file for tracking, update your memory accordingly now.

For all the suggestions that every time that Lovable has, try to write it in the .lovable, uh, memory/suggestions, and modify and remove when the suggestions are completed. And also, uh, make a plan.md file where all the things which should be done in the future, plan it, so that I could train it to another AI model. 

Any changes to the code always bump at least minor version everywhere other than `.release` folder, keep out of reach and don't modify this

Do you have any question and concern? Uh, can you please write these, uh, memories and, um, histories, please?

---

### Proofread prompt

Read and synthesize existing repository context from the Lovable memory folder and the full specification set, then produce a reliability risk report before any implementation work begins. Do not implement anything. Only produce a report and specification-side artifacts for memory, suggestions, and planning.

### Goals

1. Reconstruct project requirements by reading:
   1. the .lovable memory content
   2. the existing spec files and idea files across all projects
2. Produce a detailed risk and failure-chance report for handing the current specs to another AI.
3. Establish a disciplined workflow for Lovable suggestions tracking and future planning so another AI can continue work reliably.

### Inputs to read

1. .lovable/
   1. memories/
   2. memory/
   3. memory/suggestions/
   4. any other Lovable state folders present
   5. What todo and what not to do remember.
   7. Don't touch any skipped folder.
2. Spec folder content for all projects:
   1. ideas
   2. backend and frontend specs
   3. specs
   4. instruction builder specs
   5. seeding and configuration specs
   6. data model specs
   7. acceptance criteria specs
   8. Read root `spec/` folder or get a general idea of files.

### Deliverable 1: Reliability and failure-chance report

Produce a report that includes:

1. Success probability estimates
   1. by module complexity tier (simple, medium, complex agentic workflows, end-to-end)
   2. explicit assumptions behind each estimate

2. Failure map
   1. where failures are likely (module and workflow)
   2. why failures occur (missing constraints, ambiguity, cross-file inconsistency)
   3. how failures would manifest (symptoms)

3. Corrective actions
   1. prioritized list of spec fixes to reduce failure chance
   2. for each fix: what to change, where to change it, and the expected reliability gain

4. Readiness decision
   1. whether the spec set is ready for implementation
   2. what must be fixed before starting implementation

### Deliverable 2: Lovable suggestions workflow (filesystem contract)

Define and write a convention for capturing Lovable suggestions:

1. Location
   1. Write each suggestion into .lovable/memory/suggestions as an individual file.

2. File naming
   1. Use a deterministic naming scheme such as:
      YYYYMMDD-HHMMSS-suggestion-<slug>.md

3. Suggestion file content
   1. suggestionId
   2. createdAt
   3. source (Lovable)
   4. affectedProject
   5. description
   6. rationale
   7. proposed change
   8. acceptance criteria
   9. status (open, inProgress, done)
   10. completion notes

4. Completion handling
   1. When a suggestion is completed, update the file status to done.
   2. Optionally move completed items to an archive folder, or remove them if the policy is to keep the folder only for active items.

### Deliverable 3: plan.md future work roadmap

Create a plan.md at the repository root that captures future work so it can be handed off to another AI model.

plan.md requirements:
1. A prioritized backlog of tasks
2. Grouping by phase and by project
3. For each task:
   1. objective
   2. dependencies
   3. expected outputs (spec file updates, UI changes, API changes)
   4. acceptance criteria
4. A section titled Next task selection where the next implementable items are listed so I can pick what to implement next.

### Interaction rule

After producing the report and creating the memory and plan artifacts, ask me which specific task I want to implement next, since the specs should define what to build.
