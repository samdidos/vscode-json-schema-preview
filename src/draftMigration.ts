// F22 — draft migration (pure, VS Code-free). Transforms a parsed JSON Schema
// between draft-07, 2019-09, and 2020-12 by rewriting the well-known keyword
// changes, and reports every change it made. Conservative like F15's diff:
// anything it cannot safely transform is left untouched. Never mutates input.

import { isObject } from './schemaPointer';

export type TargetDraft = '2020-12' | '2019-09' | 'draft-07';

interface MigrationChange {
  /** JSON-Pointer-ish path to the change site (`''` = root). */
  path: string;
  change: string;
}

export interface MigrationResult {
  schema: unknown;
  changes: MigrationChange[];
}

export const META_SCHEMA: Record<TargetDraft, string> = {
  '2020-12': 'https://json-schema.org/draft/2020-12/schema',
  '2019-09': 'https://json-schema.org/draft/2019-09/schema',
  'draft-07': 'http://json-schema.org/draft-07/schema#',
};

const RANK: Record<TargetDraft, number> = { 'draft-07': 0, '2019-09': 1, '2020-12': 2 };

// Subschema-bearing keywords, by shape, so recursion reaches every nested schema
// (F22-FR-08). Single = a schema (or boolean); Array = a list of schemas;
// Map = an object whose values are schemas.
const SCHEMA_SINGLE = ['not', 'if', 'then', 'else', 'contains', 'propertyNames',
  'additionalProperties', 'additionalItems', 'unevaluatedProperties', 'unevaluatedItems'];
const SCHEMA_ARRAY = ['allOf', 'anyOf', 'oneOf', 'prefixItems'];
const SCHEMA_MAP = ['properties', 'patternProperties', '$defs', 'definitions', 'dependentSchemas'];

interface Ctx {
  target: TargetDraft;
  changes: MigrationChange[];
}

/** Migrate `schema` to `target` (F22-FR-01). Returns a new schema + change log. */
export function migrateSchema(schema: unknown, target: TargetDraft): MigrationResult {
  const ctx: Ctx = { target, changes: [] };
  const out = transform(schema, '', ctx, true);
  return { schema: out, changes: ctx.changes };
}

function record(ctx: Ctx, path: string, change: string): void {
  ctx.changes.push({ path: path || '(root)', change });
}

function transform(node: unknown, path: string, ctx: Ctx, isRoot: boolean): unknown {
  if (Array.isArray(node)) {
    return node.map((v, i) => transform(v, `${path}/${i}`, ctx, false));
  }
  if (!isObject(node)) { return node; }

  // Work on a shallow clone; keyword rewrites happen here, recursion after.
  let obj: Record<string, unknown> = { ...node };

  if (isRoot) { obj = setMetaSchema(obj, path, ctx); }

  obj = renameId(obj, path, ctx);
  obj = fixExclusiveBounds(obj, path, ctx);
  obj = migrateDefinitions(obj, path, ctx);
  obj = rewriteRef(obj, path, ctx);
  obj = migrateItems(obj, path, ctx);
  obj = migrateDependencies(obj, path, ctx);

  // Recurse into every subschema position (after this node's own renames, so we
  // descend into the renamed containers).
  for (const key of SCHEMA_SINGLE) {
    if (key in obj) { obj[key] = transform(obj[key], `${path}/${key}`, ctx, false); }
  }
  for (const key of SCHEMA_ARRAY) {
    if (Array.isArray(obj[key])) {
      obj[key] = (obj[key] as unknown[]).map((v, i) => transform(v, `${path}/${key}/${i}`, ctx, false));
    }
  }
  for (const key of SCHEMA_MAP) {
    if (isObject(obj[key])) {
      const src = obj[key] as Record<string, unknown>;
      const next: Record<string, unknown> = {};
      for (const k of Object.keys(src)) { next[k] = transform(src[k], `${path}/${key}/${k}`, ctx, false); }
      obj[key] = next;
    }
  }
  // `items` may be a single schema or a tuple array — migrateItems already
  // reshaped it, so recurse over whatever shape remains.
  if ('items' in obj) { obj.items = transform(obj.items, `${path}/items`, ctx, false); }

  return obj;
}

function setMetaSchema(obj: Record<string, unknown>, path: string, ctx: Ctx): Record<string, unknown> {
  const want = META_SCHEMA[ctx.target];
  if (obj.$schema !== want) {
    record(ctx, path, `$schema set to ${ctx.target}`);
    // Drop any existing $schema before re-adding it first, so an old value
    // doesn't override `want` via the spread (it would if `...obj` ran last).
    const { $schema: _old, ...rest } = obj;
    return { $schema: want, ...rest };
  }
  return obj;
}

// F22-FR-03: draft-04 `id` → `$id`.
function renameId(obj: Record<string, unknown>, path: string, ctx: Ctx): Record<string, unknown> {
  if (typeof obj.id === 'string' && !('$id' in obj)) {
    const { id, ...rest } = obj;
    record(ctx, path, 'id renamed to $id');
    return { $id: id, ...rest };
  }
  return obj;
}

// F22-FR-04: draft-04 boolean exclusiveMinimum/Maximum → numeric form.
function fixExclusiveBounds(obj: Record<string, unknown>, path: string, ctx: Ctx): Record<string, unknown> {
  const out = { ...obj };
  for (const [flag, bound] of [['exclusiveMinimum', 'minimum'], ['exclusiveMaximum', 'maximum']] as const) {
    if (typeof out[flag] === 'boolean') {
      if (out[flag] === true && typeof out[bound] === 'number') {
        out[flag] = out[bound];
        delete out[bound];
        record(ctx, path, `${flag} converted to numeric form`);
      } else {
        delete out[flag];
        record(ctx, path, `boolean ${flag} dropped`);
      }
    }
  }
  return out;
}

// F22-FR-05: definitions ↔ $defs by target rank.
function migrateDefinitions(obj: Record<string, unknown>, path: string, ctx: Ctx): Record<string, unknown> {
  const wantDefs = RANK[ctx.target] >= RANK['2019-09'];
  if (wantDefs && isObject(obj.definitions) && !('$defs' in obj)) {
    const { definitions, ...rest } = obj;
    record(ctx, path, 'definitions renamed to $defs');
    return { ...rest, $defs: definitions };
  }
  if (!wantDefs && isObject(obj.$defs) && !('definitions' in obj)) {
    const { $defs, ...rest } = obj;
    record(ctx, path, '$defs renamed to definitions');
    return { ...rest, definitions: $defs };
  }
  return obj;
}

// F22-FR-05: keep local $ref pointers consistent with the definitions rename.
function rewriteRef(obj: Record<string, unknown>, path: string, ctx: Ctx): Record<string, unknown> {
  if (typeof obj.$ref !== 'string') { return obj; }
  const wantDefs = RANK[ctx.target] >= RANK['2019-09'];
  const ref = obj.$ref;
  let next = ref;
  if (wantDefs && ref.startsWith('#/definitions/')) {
    next = ref.replace('#/definitions/', '#/$defs/');
  } else if (!wantDefs && ref.startsWith('#/$defs/')) {
    next = ref.replace('#/$defs/', '#/definitions/');
  }
  if (next !== ref) {
    record(ctx, path, `$ref rewritten to ${next}`);
    return { ...obj, $ref: next };
  }
  return obj;
}

// F22-FR-06: tuple items ↔ prefixItems.
function migrateItems(obj: Record<string, unknown>, path: string, ctx: Ctx): Record<string, unknown> {
  const to2020 = ctx.target === '2020-12';
  if (to2020) {
    if (Array.isArray(obj.items)) {
      const out = { ...obj };
      out.prefixItems = out.items;
      delete out.items;
      if ('additionalItems' in out) {
        out.items = out.additionalItems;
        delete out.additionalItems;
        record(ctx, path, 'tuple items → prefixItems, additionalItems → items');
      } else {
        record(ctx, path, 'tuple items → prefixItems');
      }
      return out;
    }
    return obj;
  }
  // Downgrade: prefixItems → array items; a sibling schema `items` → additionalItems.
  if (Array.isArray(obj.prefixItems)) {
    const out = { ...obj };
    if ('items' in out && !Array.isArray(out.items)) {
      out.additionalItems = out.items;
    }
    out.items = out.prefixItems;
    delete out.prefixItems;
    record(ctx, path, 'prefixItems → tuple items');
    return out;
  }
  return obj;
}

// F22-FR-07: dependencies ↔ dependentRequired/dependentSchemas.
function migrateDependencies(obj: Record<string, unknown>, path: string, ctx: Ctx): Record<string, unknown> {
  const split = RANK[ctx.target] >= RANK['2019-09'];
  if (split && isObject(obj.dependencies)) {
    const deps = obj.dependencies as Record<string, unknown>;
    const dependentRequired: Record<string, unknown> = {};
    const dependentSchemas: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(deps)) {
      if (Array.isArray(v)) { dependentRequired[k] = v; }
      else { dependentSchemas[k] = v; }
    }
    const { dependencies, ...rest } = obj;
    const out: Record<string, unknown> = { ...rest };
    if (Object.keys(dependentRequired).length) { out.dependentRequired = dependentRequired; }
    if (Object.keys(dependentSchemas).length) { out.dependentSchemas = dependentSchemas; }
    record(ctx, path, 'dependencies split into dependentRequired/dependentSchemas');
    return out;
  }
  if (!split && (isObject(obj.dependentRequired) || isObject(obj.dependentSchemas))) {
    const merged: Record<string, unknown> = {};
    if (isObject(obj.dependentRequired)) { Object.assign(merged, obj.dependentRequired); }
    if (isObject(obj.dependentSchemas)) { Object.assign(merged, obj.dependentSchemas); }
    const { dependentRequired, dependentSchemas, ...rest } = obj;
    record(ctx, path, 'dependentRequired/dependentSchemas merged into dependencies');
    return { ...rest, dependencies: merged };
  }
  return obj;
}
