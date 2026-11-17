// F21 — validation quick fixes for TOML data files (pure, VS Code-free).
//
// Every edit is positioned by the F11 scanner (`tomlLocator`), which records
// where each key, value and statement sits. A fix is produced only where the
// change is a single, self-contained piece of text: one value literal, one key
// token, one whole `key = value` line. Anything that would mean restructuring
// the document — removing a `[table]` section, adding to an inline table —
// yields no edit rather than a guess.

import type { Edit } from 'jsonc-parser';
import type { ValidationFix } from './validationFix';
import { scanToml, findTomlNode } from './tomlLocator';

const BARE_KEY = /^[A-Za-z0-9_-]+$/;

/** A TOML basic string. JSON's escapes are all valid TOML; DEL is the one
 *  control character JSON leaves raw and TOML forbids. */
function renderString(value: string): string {
  return JSON.stringify(value).replace(/\u007f/g, '\\u007f');
}

export function renderTomlKey(name: string): string {
  return BARE_KEY.test(name) ? name : renderString(name);
}

/** TOML source for `value`, or `undefined` when TOML cannot express it (it has
 *  no null, and no non-finite number spelled the way JSON would). */
export function renderTomlValue(value: unknown): string | undefined {
  if (typeof value === 'string') { return renderString(value); }
  if (typeof value === 'boolean') { return String(value); }
  if (typeof value === 'number') { return Number.isFinite(value) ? String(value) : undefined; }
  if (Array.isArray(value)) {
    const items = value.map(renderTomlValue);
    return items.some(i => i === undefined) ? undefined : `[${items.join(', ')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const pairs: string[] = [];
    for (const [k, v] of Object.entries(value)) {
      const rendered = renderTomlValue(v);
      if (rendered === undefined) { return undefined; }
      pairs.push(`${renderTomlKey(k)} = ${rendered}`);
    }
    return pairs.length ? `{ ${pairs.join(', ')} }` : '{}';
  }
  return undefined;
}

/** Edits applying `fix` to TOML `text`; empty when it cannot be applied safely. */
export function tomlFixEdits(text: string, fix: ValidationFix): Edit[] {
  const root = scanToml(text);
  if (!root) { return []; }
  const segments = fix.path.map(String);
  const name = segments[segments.length - 1];
  const parent = findTomlNode(root, segments.slice(0, -1));
  const node = findTomlNode(root, segments);

  switch (fix.kind) {
    case 'set-enum':
    case 'set-const':
    case 'coerce-type': {
      const rendered = renderTomlValue(fix.value);
      if (!node?.value || rendered === undefined) { return []; }
      return [{ offset: node.value.start, length: node.value.end - node.value.start, content: rendered }];
    }
    case 'rename-property': {
      // Only a pair with a literal value owns its key outright; a table's name
      // is repeated in every `[header]` beneath it.
      if (!node?.key || !node.value || fix.newName === undefined) { return []; }
      if (parent?.kind !== 'table' || parent.children?.has(fix.newName)) { return []; }
      return [{ offset: node.key.start, length: node.key.end - node.key.start, content: renderTomlKey(fix.newName) }];
    }
    case 'remove-additional': {
      if (!node?.statement) { return []; }
      return [{ offset: node.statement.start, length: node.statement.end - node.statement.start, content: '' }];
    }
    case 'add-required': {
      const rendered = renderTomlValue(fix.value);
      if (parent?.kind !== 'table' || parent.insertAt === undefined || rendered === undefined) { return []; }
      if (parent.children?.has(name)) { return []; }
      const at = parent.insertAt;
      // Match the indentation of the table's existing pairs, if it has any.
      const sibling = [...(parent.children?.values() ?? [])].find(c => c.statement && c.key);
      const indent = sibling ? text.slice(sibling.statement!.start, sibling.key!.start) : '';
      const lead = at > 0 && text[at - 1] !== '\n' ? '\n' : '';
      // A root key written ahead of the first header needs a blank line after
      // it, or it reads as part of that header's block.
      const trail = text[at] === '[' ? '\n' : '';
      return [{ offset: at, length: 0, content: `${lead}${indent}${renderTomlKey(name)} = ${rendered}\n${trail}` }];
    }
  }
}
