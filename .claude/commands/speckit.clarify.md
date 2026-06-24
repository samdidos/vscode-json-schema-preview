Resolve open questions in a specification before planning begins.

Arguments: path to the spec file (e.g., `specs/F10-export/spec.md`), or the
feature code / name so the file can be found.

Steps:
1. Read the spec file.
2. List every `[NEEDS CLARIFICATION]` marker found.
3. For each open question:
   a. If the answer can be derived from the constitution, existing specs, or
      the codebase, resolve it and explain the reasoning.
   b. If the answer requires a product decision, surface it clearly and ask
      the user.
4. Once all questions are answered (by derivation or user input), update the
   spec file: replace `[NEEDS CLARIFICATION]` markers with resolved text and
   remove items from the "Open Questions" section.
5. Report: questions resolved automatically vs. questions answered by user.

Do not proceed to planning until all `[NEEDS CLARIFICATION]` markers are gone.
