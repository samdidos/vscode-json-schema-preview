// F21 — validation quick fixes (pure, VS Code-free). Maps an Ajv validation
// error to zero or more concrete, mechanical repairs of the *data* document, and
// computes the edits for a repair against the document's current text via
// jsonc-parser's `modify` (so offsets are never captured stale — F21-FR-06).
// Only unambiguously-safe fixes are produced (F21-FR-01..05); anything whose
// correct value cannot be known has no fix.

import { modify, applyEdits, parseTree, findNodeAtLocation, type Edit, type FormattingOptions } from 'jsonc-parser';
import { parseJsonPointer, isObject } from './schemaPointer';

/** The subset of an Ajv `ErrorObject` this module needs (kept structural so it
 *  neither imports ajv nor couples to a specific ajv version). */
export interface AjvErrorLike {
  keyword: string;
  /** RFC 6901 JSON Pointer into the *data* instance. */
  instancePath: string;
  params: Record<string, unknown>;
  message?: string;
}

export type FixKind =
  | 'add-required'
  | 'remove-additional'
  | 'set-enum'
  | 'set-const'
  | 'coerce-type';

/**
 * A self-contained, schema-free repair: the data-instance path to edit plus the
 * value to write there (or a removal). Edit offsets are intentionally NOT stored
 * — they are derived from current text in {@link computeFixEdits}.
 */
export interface ValidationFix {
  title: string;
  kind: FixKind;
  /** jsonc-parser path (numbers for array indices) to the node to modify. */
  path: (string | number)[];
  /** Value to write; ignored when `remove` is true. */
  value?: unknown;
  remove?: boolean;
}

/** Coerce numeric-looking pointer tokens to numbers for jsonc-parser paths. */
function toModifyPath(segments: string[]): (string | number)[] {
  return segments.map(s => (/^\d+$/.test(s) ? Number(s) : s));
}

/**
 * Walk `schema` following a data `instancePath` best-effort through `properties`
 * and `items`, returning the subschema that governs that node — or `undefined`
 * when the path cannot be followed structurally (e.g. it runs through `$ref`,
 * `allOf`, or `patternProperties`, which this conservative walk does not
 * resolve). Used only to pick a sensible placeholder (F21-FR-02).
 */
function resolveDataSubschema(schema: unknown, segments: string[]): Record<string, unknown> | undefined {
  let cur: unknown = schema;
  for (const seg of segments) {
    if (!isObject(cur)) { return undefined; }
    if (/^\d+$/.test(seg)) {
      const items = cur.items;
      if (Array.isArray(items)) { cur = items[Number(seg)]; }
      else if (isObject(items)) { cur = items; }
      else { return undefined; }
    } else {
      const props = cur.properties;
      if (isObject(props) && seg in props) { cur = props[seg]; }
      else { return undefined; }
    }
  }
  return isObject(cur) ? cur : undefined;
}

/** A type-appropriate empty placeholder for a property with no better hint. */
function emptyForType(type: unknown): unknown {
  const t = Array.isArray(type) ? type[0] : type;
  switch (t) {
    case 'string': return '';
    case 'number': case 'integer': return 0;
    case 'boolean': return false;
    case 'array': return [];
    case 'object': return {};
    case 'null': return null;
    default: return null;
  }
}

/**
 * The value to insert for a newly-added required property (F21-FR-02): the
 * property subschema's `const`, else `default`, else `enum[0]`, else a
 * type-appropriate empty value; `null` when the subschema cannot be resolved.
 */
function placeholderFor(schema: unknown, objectSegments: string[], propName: string): unknown {
  const objSchema = resolveDataSubschema(schema, objectSegments);
  const propSchema = objSchema && isObject(objSchema.properties) && isObject(objSchema.properties[propName])
    ? (objSchema.properties[propName] as Record<string, unknown>)
    : undefined;
  if (!propSchema) { return null; }
  if ('const' in propSchema) { return propSchema.const; }
  if ('default' in propSchema) { return propSchema.default; }
  if (Array.isArray(propSchema.enum) && propSchema.enum.length) { return propSchema.enum[0]; }
  return emptyForType(propSchema.type);
}

/** Attempt a lossless coercion of `value` to one of the `expected` types. */
function coerce(value: unknown, expected: unknown): { ok: true; value: unknown } | { ok: false } {
  const types = new Set((Array.isArray(expected) ? expected : [expected]).map(String));
  if (types.has('string') && (typeof value === 'number' || typeof value === 'boolean')) {
    return { ok: true, value: String(value) };
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if ((types.has('number') || types.has('integer')) && trimmed !== '' && Number.isFinite(Number(trimmed))) {
      const n = Number(trimmed);
      if (types.has('integer') && !Number.isInteger(n)) { /* fall through */ }
      else { return { ok: true, value: n }; }
    }
    if (types.has('boolean') && (trimmed === 'true' || trimmed === 'false')) {
      return { ok: true, value: trimmed === 'true' };
    }
  }
  return { ok: false };
}

const MAX_ENUM_FIXES = 6;

/**
 * Map Ajv errors to concrete fixes (F21-FR-01). `data` is the parsed instance
 * (needed only to read the offending value for `type` coercion); `schema` is the
 * compiled schema (needed only to pick placeholders for `required`).
 */
export function buildFixes(errors: AjvErrorLike[], schema: unknown, data: unknown): ValidationFix[] {
  const fixes: ValidationFix[] = [];
  for (const err of errors) {
    const segments = parseJsonPointer(err.instancePath);
    const path = toModifyPath(segments);
    switch (err.keyword) {
      case 'required': {
        const name = String(err.params.missingProperty ?? '');
        if (!name) { break; }
        fixes.push({
          title: `Add missing required property "${name}"`,
          kind: 'add-required',
          path: [...path, name],
          value: placeholderFor(schema, segments, name),
        });
        break;
      }
      case 'additionalProperties':
      case 'unevaluatedProperties': {
        const name = String(err.params.additionalProperty ?? err.params.unevaluatedProperty ?? '');
        if (!name) { break; }
        fixes.push({
          title: `Remove unexpected property "${name}"`,
          kind: 'remove-additional',
          path: [...path, name],
          remove: true,
        });
        break;
      }
      case 'enum': {
        const allowed = Array.isArray(err.params.allowedValues) ? err.params.allowedValues : [];
        for (const value of allowed.slice(0, MAX_ENUM_FIXES)) {
          fixes.push({ title: `Change to ${JSON.stringify(value)}`, kind: 'set-enum', path, value });
        }
        break;
      }
      case 'const': {
        if ('allowedValue' in err.params) {
          fixes.push({
            title: `Change to ${JSON.stringify(err.params.allowedValue)}`,
            kind: 'set-const',
            path,
            value: err.params.allowedValue,
          });
        }
        break;
      }
      case 'type': {
        const current = readAt(data, segments);
        const result = coerce(current, err.params.type);
        if (result.ok) {
          fixes.push({ title: `Change to ${JSON.stringify(result.value)}`, kind: 'coerce-type', path, value: result.value });
        }
        break;
      }
      default:
        break; // no safe mechanical fix (F21-FR-05 / F17-FR-12 discipline)
    }
  }
  return fixes;
}

/** Read the value at a data pointer, or `undefined` if the path is missing. */
function readAt(data: unknown, segments: string[]): unknown {
  let cur: unknown = data;
  for (const seg of segments) {
    if (Array.isArray(cur) && /^\d+$/.test(seg)) { cur = cur[Number(seg)]; }
    else if (isObject(cur) && seg in cur) { cur = cur[seg]; }
    else { return undefined; }
  }
  return cur;
}

const DEFAULT_FORMATTING: FormattingOptions = { insertSpaces: true, tabSize: 2 };

/**
 * Compute the jsonc-parser edits that apply `fix` to `text` (F21-FR-06). Returns
 * an empty array when the target no longer exists or the edit is a no-op, so a
 * stale fix produces no action.
 */
export function computeFixEdits(text: string, fix: ValidationFix, formatting: FormattingOptions = DEFAULT_FORMATTING): Edit[] {
  const tree = parseTree(text);
  if (!tree) { return []; }
  // Honour F21-FR-06: never resurrect a deleted node. `modify` would happily
  // create missing parents, so require them to still exist. For an insertion the
  // parent object must exist; for a replace/remove the target node itself must.
  if (fix.kind === 'add-required') {
    const parent = fix.path.slice(0, -1);
    const parentNode = parent.length ? findNodeAtLocation(tree, parent) : tree;
    if (!parentNode || parentNode.type !== 'object') { return []; }
  } else {
    const node = fix.path.length ? findNodeAtLocation(tree, fix.path) : tree;
    if (!node) { return []; }
  }
  const value = fix.remove ? undefined : fix.value;
  return modify(text, fix.path, value, { formattingOptions: formatting });
}

/** Convenience for tests: the text after applying `fix`. */
export function applyFix(text: string, fix: ValidationFix, formatting: FormattingOptions = DEFAULT_FORMATTING): string {
  return applyEdits(text, computeFixEdits(text, fix, formatting));
}
