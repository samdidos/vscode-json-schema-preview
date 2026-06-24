Cross-artifact analysis: detect drift, gaps, and inconsistencies across specs,
plan, tasks, and code.

Arguments: feature code / name, or "all" to scan the entire project.

Steps:
1. Read `.specify/memory/constitution.md`.
2. For each feature (or the specified one):
   a. Check that a spec file exists in `specs/`.
   b. Check that acceptance criteria are specific and verifiable (not vague).
   c. If a plan exists, verify every spec requirement maps to at least one
      implementation step.
   d. If a tasks file exists, verify every plan step maps to at least one task.
   e. Scan `src/` for code patterns that violate the spec (e.g., missing
      workspace trust gate, missing CSP nonce, synchronous subprocess call).
3. Report findings in three tiers:
   - **Critical**: spec requirement with no implementation
   - **Warning**: implementation that diverges from spec wording
   - **Info**: spec that could be tightened or is ambiguous
4. For "all", summarize overall coverage: how many features have spec / plan /
   tasks / E2E test.

This command is read-only — it never modifies files.
