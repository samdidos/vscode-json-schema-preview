// F16 — deterministic sample-data generation from a JSON Schema. Pure and
// VS Code-free: given a parsed schema it returns a valid instance (or reports
// why one cannot be produced), so it is exhaustively unit-testable. The command
// layer supplies ref resolution and does the editor I/O.

// eslint-disable-next-line @typescript-eslint/no-require-imports
const Ajv = require('ajv').default as typeof import('ajv').default;

type Json = unknown;
type Schema = Record<string, Json>;

export interface GenerateOptions {
  /** Resolve a `$ref` to its target schema, or return undefined if unresolvable. */
  resolveRef?: (ref: string) => Json | undefined;
  /** Maximum recursion depth before terminating with a minimal value (F16-FR-07). */
  maxDepth?: number;
}

const DEFAULT_MAX_DEPTH = 5;

interface Ctx {
  resolveRef: (ref: string) => Json | undefined;
  maxDepth: number;
}

function asSchema(v: Json): Schema | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Schema) : undefined;
}

/** Minimal terminating value for a schema, used past the depth cap (F16-FR-07). */
function minimalValue(schema: Schema | undefined): Json {
  const t = firstType(schema);
  switch (t) {
    case 'object': return {};
    case 'array': return [];
    case 'string': return '';
    case 'number':
    case 'integer': return 0;
    case 'boolean': return false;
    default: return null;
  }
}

function firstType(schema: Schema | undefined): string | undefined {
  if (!schema) { return undefined; }
  if (Array.isArray(schema.type)) { return schema.type.map(String)[0]; }
  if (typeof schema.type === 'string') { return schema.type; }
  if (asSchema(schema.properties) || schema.required) { return 'object'; }
  if (schema.items) { return 'array'; }
  return undefined;
}

/**
 * Generate a sample instance for `rootSchema`. Deterministic: repeated calls on
 * an identical schema produce identical output (F16-FR-09). Never throws.
 */
export function generateSample(rootSchema: Json, opts: GenerateOptions = {}): Json {
  const ctx: Ctx = {
    resolveRef: opts.resolveRef ?? (() => undefined),
    maxDepth: opts.maxDepth ?? DEFAULT_MAX_DEPTH,
  };
  return gen(rootSchema, ctx, 0);
}

function gen(node: Json, ctx: Ctx, depth: number): Json {
  // Boolean schemas: `true` accepts anything, `false` accepts nothing — both
  // are minimally satisfied here by `null`.
  if (typeof node === 'boolean') { return null; }
  const schema = asSchema(node);
  if (!schema) { return null; }

  // Value selection priority: const → examples[0] → default → enum[0] (F16-FR-03).
  if ('const' in schema) { return schema.const; }
  if (Array.isArray(schema.examples) && schema.examples.length) { return schema.examples[0]; }
  if ('default' in schema) { return schema.default; }
  if (Array.isArray(schema.enum) && schema.enum.length) { return schema.enum[0]; }

  // $ref (F16-FR-06). Past the depth cap, terminate rather than recurse.
  if (typeof schema.$ref === 'string') {
    const target = ctx.resolveRef(schema.$ref);
    if (target === undefined) { return null; }
    if (depth >= ctx.maxDepth) { return minimalValue(asSchema(target)); }
    return gen(target, ctx, depth + 1);
  }

  // Composition (F16-FR-05).
  if (Array.isArray(schema.allOf)) {
    return gen(mergeAllOf(schema.allOf), ctx, depth);
  }
  const branches = (schema.oneOf ?? schema.anyOf) as Json[] | undefined;
  if (Array.isArray(branches) && branches.length) {
    return gen(branches[0], ctx, depth);
  }

  if (depth >= ctx.maxDepth) { return minimalValue(schema); }

  const type = firstType(schema);
  switch (type) {
    case 'object': return genObject(schema, ctx, depth);
    case 'array': return genArray(schema, ctx, depth);
    case 'string': return genString(schema);
    case 'number':
    case 'integer': return genNumber(schema, type === 'integer');
    case 'boolean': return false;
    case 'null': return null;
    default: return null;
  }
}

/** Shallow-merge allOf members: combine properties, required, and other keys. */
function mergeAllOf(members: Json[]): Schema {
  const merged: Schema = { type: 'object', properties: {}, required: [] };
  const props = merged.properties as Record<string, Json>;
  const required = merged.required as string[];
  for (const m of members) {
    const s = asSchema(m);
    if (!s) { continue; }
    if (typeof s.type === 'string' && s.type !== 'object') { merged.type = s.type; }
    const sp = asSchema(s.properties);
    if (sp) { Object.assign(props, sp); }
    if (Array.isArray(s.required)) { required.push(...(s.required as string[])); }
    for (const [k, v] of Object.entries(s)) {
      if (!['type', 'properties', 'required', 'allOf'].includes(k) && !(k in merged)) { merged[k] = v; }
    }
  }
  return merged;
}

function genObject(schema: Schema, ctx: Ctx, depth: number): Json {
  const props = asSchema(schema.properties) ?? {};
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
  const names = Object.keys(props);
  const minProps = typeof schema.minProperties === 'number' ? schema.minProperties : 0;

  const out: Record<string, Json> = {};
  // Required properties always; optional ones only to satisfy minProperties (F16-FR-04).
  const ordered = [...names.filter(n => required.has(n)), ...names.filter(n => !required.has(n))];
  for (const name of ordered) {
    if (!required.has(name) && Object.keys(out).length >= minProps) { break; }
    out[name] = gen(props[name], ctx, depth + 1);
  }
  return out;
}

function genArray(schema: Schema, ctx: Ctx, depth: number): Json {
  const min = typeof schema.minItems === 'number' ? schema.minItems : 0;
  const max = typeof schema.maxItems === 'number' ? schema.maxItems : Infinity;

  // Tuple items: one value per positional subschema.
  if (Array.isArray(schema.items)) {
    return schema.items.map(s => gen(s, ctx, depth + 1));
  }
  const count = Math.min(Math.max(min, 1), max);
  const itemSchema = schema.items ?? true;
  const out: Json[] = [];
  for (let i = 0; i < count; i++) { out.push(gen(itemSchema, ctx, depth + 1)); }
  return out;
}

function genString(schema: Schema): string {
  let value = formatSample(typeof schema.format === 'string' ? schema.format : undefined);
  if (value === undefined) {
    value = typeof schema.pattern === 'string' ? patternSample(schema.pattern) : 'string';
  }
  const min = typeof schema.minLength === 'number' ? schema.minLength : 0;
  const max = typeof schema.maxLength === 'number' ? schema.maxLength : Infinity;
  while (value.length < min) { value += 'x'; }
  if (value.length > max) { value = value.slice(0, max); }
  return value;
}

function formatSample(format: string | undefined): string | undefined {
  switch (format) {
    case 'date-time': return '2020-01-01T00:00:00Z';
    case 'date': return '2020-01-01';
    case 'time': return '00:00:00';
    case 'email': return 'user@example.com';
    case 'hostname': return 'example.com';
    case 'uri':
    case 'uri-reference':
    case 'url': return 'https://example.com';
    case 'uuid': return '00000000-0000-0000-0000-000000000000';
    case 'ipv4': return '127.0.0.1';
    default: return undefined;
  }
}

/** Best-effort literal prefix of a simple anchored pattern; falls back to "string". */
function patternSample(pattern: string): string {
  const literal = /^\^?([A-Za-z0-9 _-]+)/.exec(pattern);
  return literal ? literal[1] : 'string';
}

function genNumber(schema: Schema, integer: boolean): number {
  const min = typeof schema.minimum === 'number' ? schema.minimum : 0;
  const multipleOf = typeof schema.multipleOf === 'number' && schema.multipleOf > 0
    ? schema.multipleOf : undefined;
  let value = min;
  if (multipleOf) {
    // Smallest multiple of `multipleOf` that is >= min.
    value = Math.ceil(min / multipleOf) * multipleOf;
  }
  if (integer) { value = Math.ceil(value); }
  if (typeof schema.maximum === 'number' && value > schema.maximum) { value = schema.maximum; }
  return value;
}

// ── Ajv-gated public API (F16-FR-08) ─────────────────────────────────────────

export type GenerateResult =
  | { ok: true; value: Json }
  | { ok: false; errors: string[] };

/**
 * Generate a sample instance and validate it against the schema. Returns the
 * value only when it validates; otherwise the failing keyword paths, so the
 * caller can report an unsatisfiable/unsupported schema instead of emitting an
 * invalid document (F16-FR-08).
 */
export function generateAndValidate(rootSchema: Json, opts: GenerateOptions = {}): GenerateResult {
  const value = generateSample(rootSchema, opts);
  // validateFormats:false — our format samples are illustrative, not RFC-strict,
  // and enabling format assertion would require an extra dependency.
  const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
  let validate: ReturnType<typeof ajv.compile>;
  try {
    // Drop `$schema` so Ajv uses its own meta-schema rather than trying to fetch
    // the declared draft URI (which may be unknown to this Ajv build).
    const compileTarget = asSchema(rootSchema)
      ? Object.fromEntries(Object.entries(rootSchema as Schema).filter(([k]) => k !== '$schema'))
      : rootSchema;
    validate = ajv.compile(compileTarget as object);
  } catch (e) {
    return { ok: false, errors: [`Cannot compile schema: ${(e as Error).message}`] };
  }
  if (validate(value)) { return { ok: true, value }; }
  const errors = (validate.errors ?? []).map(
    e => `${e.instancePath || '(root)'} ${e.message ?? 'invalid'}`.trim(),
  );
  return { ok: false, errors: errors.length ? errors : ['generated value did not validate'] };
}
