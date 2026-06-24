Update or review the project constitution at `.specify/memory/constitution.md`.

Steps:
1. Read `.specify/memory/constitution.md`.
2. If arguments were provided, interpret them as amendment instructions (new principles, changed constraints, corrected facts). Otherwise, scan the repo for drift: check `CLAUDE.md`, `package.json`, `tsconfig*.json`, and the existing `specs/` files to verify the constitution is accurate.
3. Update the constitution in place, bumping `LAST_AMENDED_DATE` and `CONSTITUTION_VERSION` (patch for corrections, minor for new articles).
4. If any `.specify/templates/*.md` reference facts that changed (e.g., tech stack, coverage threshold, excluded files), update them too.
5. Report what changed and why.

Never remove an article without confirming the intent with the user first.
