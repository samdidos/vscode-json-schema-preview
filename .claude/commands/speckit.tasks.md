Break a technical plan into an ordered, executable task list.

Arguments: path to the plan file, or feature code / name.

Steps:
1. Read the plan file (`plan.md` in the feature's spec directory).
2. Decompose each implementation step into atomic tasks — each task should be
   completable in a single focused session and result in a clean commit.
3. Identify tasks that can run in parallel (no shared state, no ordering
   dependency) and mark them `[P]`.
4. Write `tasks.md` alongside the plan using
   `.specify/templates/tasks-template.md`.
5. Group tasks into logical phases:
   - **Setup** — scaffolding, new files, config contributions
   - **Core Logic** — the feature implementation
   - **Integration** — wiring into `extension.ts`, command registration
   - **E2E** — Playwright scenario and screenshot capture
   - **Cleanup** — lint, coverage check, docs update, commit
6. For any task blocked on an unresolved dependency, add a `[BLOCKED]` marker
   with the reason.
7. Confirm all acceptance criteria from the spec are covered by at least one
   task. Report any uncovered criteria.
