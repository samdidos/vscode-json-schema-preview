# Implementation Plan — [FEATURE_CODE]: [FEATURE_TITLE]

> Derived from: `specs/[FEATURE_DIR]/spec.md`
> Constitutional compliance: verified against `.specify/memory/constitution.md`

## 1. Overview

[One paragraph describing the technical approach and how it fits the architecture.]

## 2. Affected Files

| File | Change Type | Notes |
|---|---|---|
| `src/extension.ts` | Modify | Register new command / listener |
| `src/[newFile].ts` | Create | Core logic |
| `src/test/[newFile].test.ts` | Create | Unit tests |

## 3. Data Model

[TypeScript interfaces / types introduced or modified.]

```typescript
interface [NewType] {
  // fields
}
```

## 4. API / Interface Contracts

[Exported function signatures, command IDs, configuration keys, message types.]

```typescript
// Command ID
const CMD = 'jsonschema.[commandName]';

// Configuration key
// jsonschema.[configKey]: boolean (default: false)
```

## 5. Implementation Steps

1. [Step — keep atomic enough to be a single commit or task.]
2. [Step.]
3. [Step.]

## 6. Test Strategy

- Unit: [What mocha tests cover; mock points.]
- E2E: [Which Playwright demo test (if any) exercises this feature.]
- Coverage gate: all four c8 axes must remain ≥ 80 %.

## 7. Security Checklist

- [ ] Webview uses nonce-based CSP (S01).
- [ ] No user-controlled strings injected as HTML without `sanitizeHtml`.
- [ ] Temporary files cleaned up on error path.
- [ ] Credentials stored in `SecretStorage`, not plain settings.
- [ ] Workspace Trust check added where relevant (S02).

## 8. Open Issues

- [ ] [Decision or question that must be resolved before coding starts.]
