# Tasks — [FEATURE_CODE]: [FEATURE_TITLE]

> Derived from: `specs/[FEATURE_DIR]/plan.md`
> Legend: `[P]` = can run in parallel with other `[P]` tasks in the same group.

## Group 1 — Setup

- [ ] [P] Create `src/[file].ts` with skeleton exports and JSDoc stubs.
- [ ] [P] Add configuration key `jsonschema.[key]` to `package.json` contributes.
- [ ] Write unit test file `src/test/[file].test.ts` with placeholder `it.skip`.

## Group 2 — Core Logic

- [ ] Implement [main logic]; exports `[functionName](args): ReturnType`.
- [ ] [P] Write unit tests for happy path.
- [ ] [P] Write unit tests for error / edge cases.

## Group 3 — Integration

- [ ] Register command / listener in `src/extension.ts`.
- [ ] Wire configuration key to runtime behaviour.
- [ ] Update `docs/guide/[page].md` with user-facing description.

## Group 4 — E2E

- [ ] Add `src/test/e2e/demo-[feature].test.ts` Playwright scenario.
- [ ] Verify `npm run test:e2e:[feature]` captures screenshots without errors.
- [ ] Run `npm run make-gifs` and commit updated `docs/public/demo-[feature].gif`.

## Group 5 — Cleanup

- [ ] Run `npm run lint` and fix any warnings.
- [ ] Run `npm run test:coverage` — confirm all four axes ≥ 80 %.
- [ ] Update `specs/[FEATURE_DIR]/spec.md` acceptance criteria checkboxes.
- [ ] Commit with `feat([scope]): [description]`.

## Blocked

- [ ] [BLOCKED] [Task that cannot start until an open issue is resolved.]
