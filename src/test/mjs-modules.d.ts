// Lets test files `import()` the project's plain-ESM `scripts/*.mjs`
// checkers/orchestrators for direct unit testing (no separate declaration
// file per script) without pulling every .mjs under scripts/ into the
// compiled program via a blanket `allowJs`. Callers cast the resolved
// namespace to a locally-declared interface for real typing.
declare module '*.mjs' {
  const anyModule: any;
  export = anyModule;
}
