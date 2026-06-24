Implement tasks from a feature task list, one group at a time.

Arguments: path to the tasks file, or feature code / name. Optionally specify
a group to work on (e.g., "Group 2").

Steps:
1. Read `.specify/memory/constitution.md`, the spec, the plan, and the tasks
   file for the feature.
2. Identify the first uncompleted, unblocked task group.
3. For each task in the group:
   a. Implement the change (create or edit the relevant source file).
   b. Verify the PostToolUse coverage hook passes — if it fails, fix the
      coverage gap before moving to the next task.
   c. Mark the task `[x]` in `tasks.md`.
4. After completing a group, run `npm run lint` and fix any issues.
5. Commit with a conventional commit message matching the task group's intent
   (`feat:`, `test:`, `build:`, etc.).
6. Report: tasks completed, current coverage axes, next group to run.

Constitutional compliance checks during implementation:
- Never use `console.log` / `console.error` — use the LogOutputChannel.
- Never block the extension host with synchronous I/O.
- Always clean up temporary files in a `finally` block.
- Always add `context.subscriptions.push(...)` for new disposables.
