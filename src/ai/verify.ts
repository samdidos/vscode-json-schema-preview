// F32-FR-03/04/05, S20-SR-03/05 — the verification stack, and the bounded
// retry loop around it. Pure and VS Code-free: this is the part that makes an
// AI feature trustworthy, so it is the part that is unit-tested without a model.
//
// The stages run cheapest-first and each rules out a failure the previous one
// cannot see (S20's rationale table). The last one matters most: an
// unsatisfiable schema compiles and lints clean but no document can ever
// validate against it, so it fails silently at authoring time and loudly
// everywhere else.

import { createAjv } from '../ajvFactory';
import { lintSchema } from '../schemaLinter';
import { generateAndValidate } from '../sampleDataGenerator';
import { extractJson } from './extract';

type VerifyStage = 'parse' | 'compile' | 'lint' | 'sample' | 'scope';

export interface VerifyProblem {
  stage: VerifyStage;
  message: string;
}

export type VerifyResult =
  | { ok: true; schema: unknown; text: string }
  | { ok: false; problems: VerifyProblem[]; schema?: unknown; text?: string };

export interface VerifyOptions {
  /**
   * Reject a candidate that changes anything outside the keys the command
   * promised to touch (S20-SR-04) — e.g. a description pass that also retypes a
   * property. Given the original schema, return a problem message or undefined.
   */
  scopeCheck?: (candidate: unknown) => string | undefined;
  /** Skip the sample stage for a schema fragment that is not a whole document. */
  skipSample?: boolean;
}

/**
 * Run a model's raw response through every stage (F32-FR-03). Never throws;
 * every failure becomes a structured problem the retry loop can feed back.
 */
export function verifySchemaResponse(response: string, opts: VerifyOptions = {}): VerifyResult {
  const extracted = extractJson(response);
  if (!extracted.ok) {
    return { ok: false, problems: [{ stage: 'parse', message: extracted.reason }] };
  }
  const { value: schema, text } = extracted;

  const problems: VerifyProblem[] = [];

  // Stage 2 — is it a valid *schema*, not merely valid JSON?
  try {
    const ajv = createAjv(schema, { strict: false, allErrors: true, validateFormats: false });
    ajv.compile(stripMeta(schema) as object);
  } catch (e) {
    // A schema that does not compile cannot be linted or sampled meaningfully,
    // so this stage is terminal.
    return {
      ok: false,
      schema,
      text,
      problems: [{ stage: 'compile', message: `Ajv rejected the schema: ${(e as Error).message}` }],
    };
  }

  // Stage 3 — quality gate: warnings only, so hints never block a draft.
  try {
    for (const finding of lintSchema(text, 'json')) {
      if (finding.defaultSeverity !== 'warning') { continue; }
      problems.push({ stage: 'lint', message: `${finding.ruleId}: ${finding.message}` });
    }
  } catch (e) {
    problems.push({ stage: 'lint', message: `Linting failed: ${(e as Error).message}` });
  }

  // Stage 4 — is the schema satisfiable at all?
  if (!opts.skipSample) {
    const sample = generateAndValidate(schema, {});
    if (!sample.ok) {
      problems.push({
        stage: 'sample',
        message: `No valid instance could be produced: ${sample.errors.join('; ')}`,
      });
    }
  }

  // Stage 5 — did the model stay inside what the command promised?
  const scopeProblem = opts.scopeCheck?.(schema);
  if (scopeProblem) {
    problems.push({ stage: 'scope', message: scopeProblem });
  }

  return problems.length ? { ok: false, problems, schema, text } : { ok: true, schema, text };
}

/** Drop `$schema` so Ajv uses its own meta-schema instead of fetching a draft URI. */
function stripMeta(schema: unknown): unknown {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema)) { return schema; }
  return Object.fromEntries(
    Object.entries(schema as Record<string, unknown>).filter(([k]) => k !== '$schema'),
  );
}

export type GeneratedOutcome<T> =
  | { ok: true; value: T; attempts: number }
  | { ok: false; value?: T; problems: VerifyProblem[]; attempts: number };

export interface LoopOptions<T> {
  /** Produce a candidate. `problems` carries the previous attempt's failures. */
  generate: (problems: VerifyProblem[]) => Promise<string>;
  /** Verify a candidate response. */
  verify: (response: string) => { ok: true; value: T } | { ok: false; problems: VerifyProblem[]; value?: T };
  /** How many attempts to make in total. Clamped to at least 1 (F32-FR-04). */
  maxAttempts?: number;
}

export const DEFAULT_MAX_ATTEMPTS = 3;

/**
 * The verified-generation loop (F32-FR-04/05): generate, verify, and on failure
 * retry with the concrete problems fed back. Exhausting the attempts returns
 * the last candidate together with its outstanding problems — surfaced to the
 * user marked unverified, never silently and never as if it had passed
 * (S20-SR-05).
 *
 * Both callbacks are injected, so the retry policy is testable without a model.
 */
export async function runVerifiedGeneration<T>(opts: LoopOptions<T>): Promise<GeneratedOutcome<T>> {
  const maxAttempts = Math.max(1, Math.trunc(opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS));
  let problems: VerifyProblem[] = [];
  let lastValue: T | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let response: string;
    try {
      response = await opts.generate(problems);
    } catch (e) {
      problems = [{ stage: 'parse', message: `The model request failed: ${(e as Error).message}` }];
      continue;
    }
    const verified = opts.verify(response);
    if (verified.ok) {
      return { ok: true, value: verified.value, attempts: attempt };
    }
    problems = verified.problems;
    lastValue = verified.value ?? lastValue;
  }

  return { ok: false, value: lastValue, problems, attempts: maxAttempts };
}

/** Human-readable summary of why a candidate is unverified (F32-FR-04). */
export function describeProblems(problems: VerifyProblem[]): string {
  if (!problems.length) { return 'No problems were reported.'; }
  return problems.map(p => `- [${p.stage}] ${p.message}`).join('\n');
}

// ── Scope checks (S20-SR-04) ─────────────────────────────────────────────────

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

/**
 * F32-FR-07 — reject a "describe the properties" result that changed anything
 * but `description` keys. Structural equality is compared with descriptions
 * stripped from both sides, so an added description passes and a retyped
 * property does not.
 */
export function onlyDescriptionsChanged(original: unknown, candidate: unknown): string | undefined {
  const before = JSON.stringify(stripDescriptions(original));
  const after = JSON.stringify(stripDescriptions(candidate));
  return before === after
    ? undefined
    : 'The result changed more than descriptions; only "description" keys may be added or edited.';
}

function stripDescriptions(value: unknown): unknown {
  if (Array.isArray(value)) { return value.map(stripDescriptions); }
  if (!isRecord(value)) { return value; }
  const out: Record<string, unknown> = {};
  for (const key of Object.keys(value).sort()) {
    if (key === 'description') { continue; }
    out[key] = stripDescriptions(value[key]);
  }
  return out;
}

/**
 * F32-FR-10 — reject an "enrich" result that removed a property or changed an
 * existing property's declared `type`. Additive refinement is the promise;
 * anything else is a rewrite the user did not ask for.
 */
export function noPropertyLoss(original: unknown, candidate: unknown): string | undefined {
  const before = collectTypes(original);
  const after = collectTypes(candidate);
  for (const [path, type] of before) {
    if (!after.has(path)) {
      return `The result dropped the property "${path}".`;
    }
    const next = after.get(path);
    if (type !== undefined && next !== undefined && type !== next) {
      return `The result retyped "${path}" from ${type} to ${next}.`;
    }
  }
  return undefined;
}

/** Map every declared property path to its declared type (undefined when untyped). */
function collectTypes(schema: unknown, path = '', seen = new Set<unknown>()): Map<string, string | undefined> {
  const out = new Map<string, string | undefined>();
  if (!isRecord(schema) || seen.has(schema)) { return out; }
  seen.add(schema);

  const properties = schema.properties;
  if (isRecord(properties)) {
    for (const [name, sub] of Object.entries(properties)) {
      const childPath = path ? `${path}.${name}` : name;
      out.set(childPath, isRecord(sub) && typeof sub.type === 'string' ? sub.type : undefined);
      for (const [k, v] of collectTypes(sub, childPath, seen)) { out.set(k, v); }
    }
  }
  const items = schema.items;
  if (isRecord(items)) {
    for (const [k, v] of collectTypes(items, `${path}[]`, seen)) { out.set(k, v); }
  }
  for (const keyword of ['allOf', 'anyOf', 'oneOf'] as const) {
    const branches = schema[keyword];
    if (!Array.isArray(branches)) { continue; }
    for (const branch of branches) {
      for (const [k, v] of collectTypes(branch, path, seen)) { out.set(k, v); }
    }
  }
  const defs = schema.$defs ?? schema.definitions;
  if (isRecord(defs)) {
    for (const [name, sub] of Object.entries(defs)) {
      for (const [k, v] of collectTypes(sub, `$defs.${name}`, seen)) { out.set(k, v); }
    }
  }
  return out;
}
