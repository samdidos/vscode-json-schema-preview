// F14 — schema bundling & dereferencing. Pure and VS Code-free: the walk,
// $defs keying, ref rewriting, and cycle protection live here; all I/O (reading
// relative files, fetching remote refs with auth/cache) is delegated to a
// caller-supplied async resolver. Reuses the RFC 6901 helpers from schemaPointer.

import { parseRef, parseJsonPointer, resolvePointer } from './schemaPointer';

/** A resolved external document. `id` is a canonical identifier for dedup. */
export interface ResolvedDoc {
  id: string;
  schema: unknown;
  /** Preferred `$defs` key hint (e.g. filename stem); optional. */
  keyHint?: string;
}

/** Resolve a `$ref` document URI (the part before `#`) against a base document id. */
export type DocResolver = (uri: string, baseId: string) => Promise<ResolvedDoc>;

export interface BundleOptions {
  /** Maximum distinct external documents before aborting (F14-NFR-01). */
  maxDocs?: number;
}

const DEFAULT_MAX_DOCS = 100;

function clone<T>(v: T): T {
  return structuredClone(v);
}

function isObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === 'object' && !Array.isArray(v);
}

/** Derive a $defs key from a schema's `$id` or the ref URI; sanitised. */
export function deriveKey(schema: unknown, uri: string): string {
  const fromId = isObject(schema) && typeof schema.$id === 'string' ? schema.$id : undefined;
  const source = fromId ?? uri;
  const noFrag = source.split('#')[0];
  const stem = noFrag.split(/[\\/]/).pop() ?? noFrag;
  const base = stem.replace(/\.[^.]+$/, '').replace(/[^A-Za-z0-9_-]/g, '_');
  return base || 'schema';
}

function uniqueKey(used: Set<string>, hint: string): string {
  let key = hint;
  let i = 1;
  while (used.has(key)) { key = `${hint}_${++i}`; }
  used.add(key);
  return key;
}

/** Fragment body after `#` (`"#/a/b"` → `"/a/b"`, `"#"` → `""`). */
function fragBody(fragment: string): string {
  return fragment.startsWith('#') ? fragment.slice(1) : fragment;
}

// ── Bundle: external docs → $defs, refs rewritten to local pointers ──────────

/**
 * Bundle `rootInput` into one self-contained schema (F14-FR-05): each distinct
 * external document is embedded once under `$defs` with a deterministic key, and
 * every referring `$ref` is rewritten to the local pointer. The root's own
 * internal refs and its `$schema`/`$id` are preserved (F14-FR-07). Nested `$id`s
 * in embedded copies are removed. Throws (naming the ref) on an unresolvable
 * document (F14-FR-08) or when the document cap is exceeded (F14-NFR-01).
 */
export async function bundleSchema(
  rootInput: unknown,
  resolve: DocResolver,
  opts: BundleOptions = {},
): Promise<{ schema: unknown; strippedIds: string[] }> {
  const maxDocs = opts.maxDocs ?? DEFAULT_MAX_DOCS;
  const root = clone(rootInput);
  const idToKey = new Map<string, string>();
  const used = new Set<string>(isObject(root) && isObject(root.$defs) ? Object.keys(root.$defs) : []);
  const queue: Array<{ schema: unknown; key: string; id: string }> = [];
  const strippedIds: string[] = [];
  let docCount = 0;

  async function handleRef(ref: string, baseId: string, selfKey: string | undefined): Promise<string> {
    const { uri, fragment } = parseRef(ref);
    if (uri === '') {
      // Internal ref: unchanged in the root, rebased into the embedded copy.
      return selfKey === undefined ? ref : `#/$defs/${selfKey}${fragBody(fragment)}`;
    }
    const resolved = await resolve(uri, baseId); // may throw → propagates (F14-FR-08)
    let key = idToKey.get(resolved.id);
    if (key === undefined) {
      if (docCount >= maxDocs) {
        throw new Error(`Bundling aborted: more than ${maxDocs} external documents.`);
      }
      docCount++;
      key = uniqueKey(used, resolved.keyHint ?? deriveKey(resolved.schema, uri));
      idToKey.set(resolved.id, key);
      queue.push({ schema: resolved.schema, key, id: resolved.id });
    }
    return `#/$defs/${key}${fragBody(fragment)}`;
  }

  async function transform(node: unknown, baseId: string, selfKey: string | undefined, embedded: boolean): Promise<unknown> {
    if (Array.isArray(node)) {
      return Promise.all(node.map(n => transform(n, baseId, selfKey, embedded)));
    }
    if (!isObject(node)) { return node; }
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '$ref' && typeof v === 'string') {
        out.$ref = await handleRef(v, baseId, selfKey);
      } else if (k === '$id' && embedded) {
        strippedIds.push(String(v)); // F14-FR-07: drop nested $id in embedded copies
      } else {
        out[k] = await transform(v, baseId, selfKey, embedded);
      }
    }
    return out;
  }

  const newRoot = await transform(root, '', undefined, false) as Record<string, unknown>;
  const defs: Record<string, unknown> = isObject(newRoot.$defs) ? { ...newRoot.$defs } : {};
  while (queue.length) {
    const { schema, key, id } = queue.shift()!;
    defs[key] = await transform(clone(schema), id, key, true);
  }
  if (Object.keys(defs).length) { newRoot.$defs = defs; }
  return { schema: newRoot, strippedIds: [...new Set(strippedIds)] };
}

// ── Dereference: inline refs, cycles hoisted into $defs ──────────────────────

/**
 * Dereference `rootInput` by inlining every `$ref`'s target (F14-FR-06). Cyclic
 * references are detected and left as internal `$ref`s into a `$defs` section so
 * expansion always terminates. Nested `$id`s in inlined content are removed
 * (F14-FR-07). Throws on an unresolvable ref (F14-FR-08).
 */
export async function dereferenceSchema(
  rootInput: unknown,
  resolve: DocResolver,
  opts: BundleOptions = {},
): Promise<{ schema: unknown; strippedIds: string[] }> {
  const maxDocs = opts.maxDocs ?? DEFAULT_MAX_DOCS;
  const root = clone(rootInput);
  const cycleDefs: Record<string, unknown> = {};
  const cycleKeyByRef = new Map<string, string>();
  const used = new Set<string>(isObject(root) && isObject(root.$defs) ? Object.keys(root.$defs) : []);
  const strippedIds: string[] = [];
  let resolveCount = 0;

  async function expand(
    node: unknown,
    docRoot: unknown,
    baseId: string,
    stack: string[],
    inlined: boolean,
  ): Promise<unknown> {
    if (Array.isArray(node)) {
      return Promise.all(node.map(n => expand(n, docRoot, baseId, stack, inlined)));
    }
    if (!isObject(node)) { return node; }

    if (typeof node.$ref === 'string') {
      const { uri, fragment } = parseRef(node.$ref);
      const ptr = parseJsonPointer(fragment);
      let targetRoot = docRoot;
      let targetBase = baseId;
      if (uri !== '') {
        if (++resolveCount > maxDocs * 100) {
          throw new Error('Dereferencing aborted: ref graph too large.');
        }
        const resolved = await resolve(uri, baseId); // may throw → propagates
        targetRoot = resolved.schema;
        targetBase = resolved.id;
      }
      const target = resolvePointer(targetRoot, ptr);
      if (target === undefined) {
        throw new Error(`Cannot resolve $ref "${node.$ref}".`);
      }
      const refKey = `${targetBase}#/${ptr.join('/')}`;
      if (stack.includes(refKey)) {
        // Cycle: hoist the target into $defs and reference it (F14-FR-06).
        let key = cycleKeyByRef.get(refKey);
        if (key === undefined) {
          key = uniqueKey(used, deriveKey(target, uri));
          cycleKeyByRef.set(refKey, key);
          cycleDefs[key] = await expand(clone(target), targetRoot, targetBase, [...stack, refKey], true);
        }
        return { $ref: `#/$defs/${key}` };
      }
      return expand(clone(target), targetRoot, targetBase, [...stack, refKey], true);
    }

    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(node)) {
      if (k === '$id' && inlined) {
        strippedIds.push(String(v)); // F14-FR-07
      } else {
        out[k] = await expand(v, docRoot, baseId, stack, inlined);
      }
    }
    return out;
  }

  const result = await expand(root, root, '', [], false) as Record<string, unknown>;
  if (Object.keys(cycleDefs).length) {
    result.$defs = { ...(isObject(result.$defs) ? result.$defs : {}), ...cycleDefs };
  }
  return { schema: result, strippedIds: [...new Set(strippedIds)] };
}
