Write a new feature specification for this project.

Arguments: feature description provided by the user (what and why, not how).

Steps:
1. Read `.specify/memory/constitution.md` to understand project constraints.
2. Determine a feature code (next available `F##` or `S##` in `specs/`) and a
   short kebab-case name (e.g., `export-pdf`).
3. Create directory `specs/<feature-code>-<name>/` and write `spec.md` using
   `.specify/templates/spec-template.md` as the template.
4. Fill in: overview, 2-3 user stories, functional requirements using RFC-2119
   MUST/SHOULD/MAY, acceptance criteria, and any open questions marked
   `[NEEDS CLARIFICATION]`.
5. Verify the spec does not conflict with existing `specs/F*.md` or `specs/S*.md`
   requirements. Note any overlaps.
6. Output a short summary: file created, requirement count, open questions.

Do not create a plan or tasks yet — those come from `/speckit.plan`.
