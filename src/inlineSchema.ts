// F13-FR-11: locate an actual document-level binding, including its source
// range. Parsing keeps comments and strings containing lookalike keys inert.
import { parseTree, type ParseError } from 'jsonc-parser';
import { parseDocument, isMap, isNode, isScalar, visit } from 'yaml';
import { parse as parseToml } from 'smol-toml';

export interface InlineSchemaReference {
  url: string;
  start: number;
  end: number;
  directive?: boolean;
  keyStart?: number;
  flow?: boolean;
}

export function inlineSchemaReference(
  text: string, language: string, includeNonStringValue = false,
): InlineSchemaReference | undefined {
  try {
    if (language === 'yaml' || language === 'yml') {
      const doc = parseDocument(text);
      // A directive-looking line inside a quoted/block scalar is just data.
      const scalars: Array<readonly number[]> = [];
      visit(doc, (_key, node) => {
        if (isScalar(node) && node.range) { scalars.push(node.range); }
      });
      for (const directive of text.matchAll(/^#[ \t]*yaml-language-server:[ \t]*\$schema=([^\r\n]+)/gim)) {
        if (scalars.some(range => directive.index >= range[0] && directive.index < range[1])) { continue; }
        const url = directive[1].trim();
        const start = directive.index + directive[0].indexOf('=') + 1 + directive[1].indexOf(url);
        return url ? { url, start, end: start + url.length, directive: true, keyStart: directive.index } : undefined;
      }
      if (!isMap(doc.contents)) { return undefined; }
      const pair = doc.contents.items.find(item => isScalar(item.key) && item.key.value === '$schema');
      const value = pair?.value;
      if (!isNode(value) || !value.range) { return undefined; }
      const url = isScalar(value) && typeof value.value === 'string' ? value.value : undefined;
      if (url === undefined && !includeNonStringValue) { return undefined; }
      return { url: url ?? '', start: value.range[0], end: value.range[1],
        keyStart: isScalar(pair?.key) ? pair.key.range?.[0] : undefined, flow: doc.contents.flow };
    }
    if (language === 'toml') { return tomlReference(text); }
    if (language !== 'json' && language !== 'jsonc') { return undefined; }
    const errors: ParseError[] = [];
    const root = parseTree(text, errors, {
      allowTrailingComma: language === 'jsonc', disallowComments: language === 'json',
    });
    if (errors.length || root?.type !== 'object') { return undefined; }
    const properties = root.children?.filter(p => p.children?.[0]?.value === '$schema');
    const value = properties?.[properties.length - 1]?.children?.[1];
    return value?.type === 'string'
      ? { url: value.value, start: value.offset, end: value.offset + value.length }
      : undefined;
  } catch {
    return undefined;
  }
}

/** Offset immediately after a TOML string token. This also skips multiline
 * descriptions while the rest of the document is still being edited. */
function stringEnd(text: string, start: number): number {
  const quote = text[start];
  const multiline = text.slice(start, start + 3) === quote.repeat(3);
  let i = start + (multiline ? 3 : 1);
  while (i < text.length) {
    if (quote === '"' && text[i] === '\\') { i += 2; continue; }
    if (text[i] === quote) {
      if (!multiline) { return i + 1; }
      if (text.slice(i, i + 3) === quote.repeat(3)) {
        i += 3;
        // TOML permits one or two quote characters before the closing delimiter.
        while (text[i] === quote) { i++; }
        return i;
      }
    }
    i++;
  }
  return text.length;
}

function tomlReference(text: string): InlineSchemaReference | undefined {
  let depth = 0;
  for (let i = 0; i < text.length;) {
    const ch = text[i];
    if (ch === '#') {
      const newline = text.indexOf('\n', i);
      i = newline < 0 ? text.length : newline + 1;
    } else if (ch === '"' || ch === "'") {
      const end = stringEnd(text, i);
      const lineStart = text.lastIndexOf('\n', i - 1) + 1;
      if (depth === 0 && /^[ \t]*$/.test(text.slice(lineStart, i))) {
        const assignment = /^[ \t]*=[ \t]*/.exec(text.slice(end));
        if (assignment) {
          const start = end + assignment[0].length;
          if (text[start] === '"' || text[start] === "'") {
            const valueEnd = stringEnd(text, start);
            const statement = parseToml(text.slice(i, valueEnd));
            if (typeof statement.$schema === 'string') {
              return { url: statement.$schema, start, end: valueEnd, keyStart: i };
            }
          }
        }
      }
      i = end;
    } else if (depth === 0 && ch === '[' && /^[ \t]*$/.test(text.slice(text.lastIndexOf('\n', i - 1) + 1, i))) {
      // Root-table assignments precede the first real table header. Headers
      // inside multiline strings were already skipped as a single token.
      return undefined;
    } else {
      if (ch === '[' || ch === '{') { depth++; }
      if (ch === ']' || ch === '}') { depth--; }
      i++;
    }
  }
  return undefined;
}
