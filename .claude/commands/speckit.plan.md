Create a technical implementation plan from a feature specification.

Arguments: path to the spec file, or feature code / name.

Steps:
1. Read `.specify/memory/constitution.md`.
2. Read the spec file. Abort if any `[NEEDS CLARIFICATION]` markers remain —
   tell the user to run `/speckit.clarify` first.
3. Analyse the existing codebase (relevant files in `src/`) to understand
   integration points and avoid duplication.
4. Write `plan.md` alongside the spec (same directory) using
   `.specify/templates/plan-template.md`.
5. The plan MUST include:
   - Affected files table (create / modify / delete)
   - TypeScript interfaces for any new data shapes
   - Command IDs and configuration keys
   - Ordered implementation steps (atomic enough for one commit each)
   - Test strategy (unit mocks + E2E Playwright scenario name)
   - Security checklist (all seven items from the template)
6. Verify constitutional compliance:
   - No blocking calls in the extension host
   - Nonce CSP if a webview is added
   - Workspace Trust gate if feature touches file system or network
   - Coverage stays ≥ 80 % across all four axes
7. Report the plan summary and flag any unresolved architectural decisions.
