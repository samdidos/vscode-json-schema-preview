// F29 — schema test suites. Pure and VS Code-free: parses a `*.schema.test.json`
// document into a suite and runs its cases against an already-resolved schema,
// so the same engine backs the editor command, the workspace sweep (F20) and
// the CLI (F27). Resolving the suite's `schema` reference and reading a case's
// `file` are the caller's job (F29-NFR-02), injected via `RunOptions`.

import { createAjv } from './ajvFactory';

type Expect = 'valid' | 'invalid';

interface TestCase {
  /** Reported name: the case's own `name`, else a positional label (F29-FR-03). */
  name: string;
  expect: Expect;
  /** Index within its own `valid`/`invalid` array. */
  index: number;
  /** JSON Pointer to the case within the suite document, for source location. */
  pointer: string;
  /** Inline instance; mutually exclusive with `file`. */
  instance?: unknown;
  /** Path to a fixture holding the instance, resolved by the caller. */
  file?: string;
  /** Error keywords an `invalid` case expects (F29-FR-07). */
  errors?: string[];
}

export interface TestSuite {
  /** Path or URL of the schema under test, resolved like a `$ref` (F13). */
  schemaRef: string;
  description?: string;
  cases: TestCase[];
}

export interface SuiteProblem {
  message: string;
  /** JSON Pointer to the offending part of the suite document. */
  pointer: string;
}

export type ParseResult =
  | { ok: true; suite: TestSuite }
  | { ok: false; problems: SuiteProblem[] };

export interface CaseResult {
  name: string;
  expect: Expect;
  pointer: string;
  passed: boolean;
  /** Why the case failed; absent when it passed. */
  message?: string;
  /** Error keywords Ajv actually reported, for reporting a mismatch. */
  keywords: string[];
}

export interface SuiteResult {
  total: number;
  passed: number;
  failed: number;
  cases: CaseResult[];
  /** Set when the schema itself could not be compiled — every case fails. */
  schemaError?: string;
}

export interface RunOptions {
  /** Read and parse the instance a case's `file` points at. Throws to fail the case. */
  loadInstance?: (file: string) => unknown;
}

/** True for a file name the suite discovery (F20-FR-09) should pick up. */
export function isSuitePath(fsPath: string): boolean {
  return /\.schema\.test\.jsonc?$/i.test(fsPath);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/**
 * A case entry is a *descriptor* only when it is an object carrying `instance`
 * or `file` (F29-FR-02). Anything else — including an object with a `name` key
 * but no `instance` — is a bare instance, so a document that happens to have
 * those shapes is never misread as test metadata.
 */
function isDescriptor(entry: unknown): entry is Record<string, unknown> {
  return isRecord(entry) && ('instance' in entry || 'file' in entry);
}

function parseCases(
  raw: unknown,
  expect: Expect,
  problems: SuiteProblem[],
): TestCase[] {
  if (raw === undefined) { return []; }
  if (!Array.isArray(raw)) {
    problems.push({ message: `"${expect}" must be an array of cases.`, pointer: `/${expect}` });
    return [];
  }
  const cases: TestCase[] = [];
  raw.forEach((entry, index) => {
    const pointer = `/${expect}/${index}`;
    const fallbackName = `${expect}[${index}]`;
    if (!isDescriptor(entry)) {
      cases.push({ name: fallbackName, expect, index, pointer, instance: entry });
      return;
    }
    const name = typeof entry.name === 'string' && entry.name.trim() ? entry.name : fallbackName;
    const file = typeof entry.file === 'string' ? entry.file : undefined;
    if (file === undefined && !('instance' in entry)) {
      problems.push({ message: `Case "${name}" has neither "instance" nor "file".`, pointer });
      return;
    }
    let errors: string[] | undefined;
    if ('errors' in entry) {
      if (Array.isArray(entry.errors) && entry.errors.every(e => typeof e === 'string')) {
        errors = entry.errors as string[];
      } else {
        problems.push({ message: `Case "${name}": "errors" must be an array of keyword strings.`, pointer });
      }
      if (expect === 'valid' && errors) {
        problems.push({ message: `Case "${name}": "errors" is meaningless on a valid case.`, pointer });
      }
    }
    cases.push({
      name, expect, index, pointer,
      ...(file !== undefined ? { file } : { instance: entry.instance }),
      ...(errors ? { errors } : {}),
    });
  });
  return cases;
}

/**
 * Parse a suite document (F29-FR-01..04). Total: every problem found is
 * reported together, and nothing throws on arbitrary input.
 */
export function parseTestSuite(value: unknown): ParseResult {
  const problems: SuiteProblem[] = [];
  if (!isRecord(value)) {
    return { ok: false, problems: [{ message: 'A test suite must be a JSON object.', pointer: '' }] };
  }
  const schemaRef = value.schema;
  if (typeof schemaRef !== 'string' || !schemaRef.trim()) {
    problems.push({ message: 'A test suite must declare "schema" (a path or URL).', pointer: '/schema' });
  }
  if (!('valid' in value) && !('invalid' in value)) {
    problems.push({ message: 'A test suite must declare at least one of "valid" / "invalid".', pointer: '' });
  }
  const cases = [
    ...parseCases(value.valid, 'valid', problems),
    ...parseCases(value.invalid, 'invalid', problems),
  ];
  if (problems.length) { return { ok: false, problems }; }
  return {
    ok: true,
    suite: {
      schemaRef: schemaRef as string,
      ...(typeof value.description === 'string' ? { description: value.description } : {}),
      cases,
    },
  };
}

type Validator = (data: unknown) => { ok: boolean; keywords: string[]; messages: string[] };

/** Compile `schema` into a validator, or return the compile error (F29-FR-05). */
function compile(schema: unknown): Validator | string {
  let validate;
  try {
    const ajv = createAjv(schema, { allErrors: true, strict: false, validateFormats: false });
    validate = ajv.compile(schema as object);
  } catch (e) {
    return (e as Error).message;
  }
  return (data: unknown) => {
    const ok = validate(data) as boolean;
    const errs = validate.errors ?? [];
    return {
      ok,
      keywords: errs.map(e => e.keyword),
      messages: errs.map(e => `${e.instancePath || '(root)'} ${e.message ?? 'is invalid'}`.trim()),
    };
  };
}

function resolveInstance(testCase: TestCase, opts: RunOptions): { ok: true; value: unknown } | { ok: false; message: string } {
  if (testCase.file === undefined) { return { ok: true, value: testCase.instance }; }
  if (!opts.loadInstance) {
    return { ok: false, message: `Cannot read "${testCase.file}": no fixture loader available.` };
  }
  try {
    return { ok: true, value: opts.loadInstance(testCase.file) };
  } catch (e) {
    return { ok: false, message: `Cannot read "${testCase.file}": ${(e as Error).message}` };
  }
}

function judge(testCase: TestCase, result: ReturnType<Validator>): { passed: boolean; message?: string } {
  if (testCase.expect === 'valid') {
    if (result.ok) { return { passed: true }; }
    return { passed: false, message: `Expected valid, but validation failed: ${result.messages.join('; ')}` };
  }
  // invalid
  if (result.ok) {
    return { passed: false, message: 'Expected invalid, but the instance validated cleanly.' };
  }
  if (!testCase.errors?.length) { return { passed: true }; }
  const reported = new Set(result.keywords);
  const missing = testCase.errors.filter(k => !reported.has(k));
  if (!missing.length) { return { passed: true }; }
  // F29-FR-07: a declared keyword that nothing reported fails the case, and the
  // message names what *was* reported so the test cannot pass for another reason.
  return {
    passed: false,
    message:
      `Expected error keyword(s) ${missing.map(k => `"${k}"`).join(', ')}, ` +
      `but validation reported ${result.keywords.length ? [...reported].map(k => `"${k}"`).join(', ') : 'none'}.`,
  };
}

/**
 * Run every case in `suite` against `schema` (F29-FR-05..09). Never throws: a
 * schema that does not compile fails every case with the compile error, and a
 * case whose fixture cannot be read fails only itself.
 */
export function runTestSuite(suite: TestSuite, schema: unknown, opts: RunOptions = {}): SuiteResult {
  const validator = compile(schema);
  if (typeof validator === 'string') {
    const cases = suite.cases.map<CaseResult>(c => ({
      name: c.name, expect: c.expect, pointer: c.pointer, passed: false,
      message: `Schema does not compile: ${validator}`, keywords: [],
    }));
    return { total: cases.length, passed: 0, failed: cases.length, cases, schemaError: validator };
  }

  const cases: CaseResult[] = suite.cases.map(testCase => {
    const resolved = resolveInstance(testCase, opts);
    if (!resolved.ok) {
      return { name: testCase.name, expect: testCase.expect, pointer: testCase.pointer, passed: false, message: resolved.message, keywords: [] };
    }
    let result: ReturnType<Validator>;
    try {
      result = validator(resolved.value);
    } catch (e) {
      return {
        name: testCase.name, expect: testCase.expect, pointer: testCase.pointer, passed: false,
        message: `Validation threw: ${(e as Error).message}`, keywords: [],
      };
    }
    const verdict = judge(testCase, result);
    return {
      name: testCase.name, expect: testCase.expect, pointer: testCase.pointer,
      passed: verdict.passed, ...(verdict.message ? { message: verdict.message } : {}),
      keywords: result.keywords,
    };
  });

  const passed = cases.filter(c => c.passed).length;
  return { total: cases.length, passed, failed: cases.length - passed, cases };
}

/** Text report of one suite run, shared by the CLI and the workspace report. */
export function renderSuiteReport(result: SuiteResult, header: string): string {
  const lines = [`# Schema tests — ${header}`, ''];
  if (result.schemaError) {
    lines.push(`**Schema did not compile:** ${result.schemaError}`, '');
  }
  lines.push(`**${result.passed} / ${result.total} cases passed.**`, '');
  const failures = result.cases.filter(c => !c.passed);
  if (!failures.length) {
    lines.push('Every case passed. 🎉', '');
    return lines.join('\n');
  }
  lines.push(`## Failing cases (${failures.length})`, '');
  for (const c of failures) {
    lines.push(`- **${c.name}** (expected ${c.expect}) — ${c.message ?? 'failed'}`);
  }
  lines.push('');
  return lines.join('\n');
}
