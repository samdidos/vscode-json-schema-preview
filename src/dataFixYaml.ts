// F21 — validation quick fixes for YAML data files (pure, VS Code-free).
//
// Two kinds of edit, chosen by how much of the document each has to touch:
//
// - Replacing a value or renaming a key rewrites one token, located by the
//   YAML parser's own source range. Nothing else in the file moves.
// - Adding or removing a property changes the document's structure, where
//   indentation, flow style and comment attachment all matter. Those go
//   through the parser's own serialiser: the document is printed before and
//   after the change, and only the lines that differ between the two printings
//   are written back. That is sound only when the printing lines up with the
//   source line for line, so a document the serialiser would re-wrap or
//   re-indent gets no structural fix rather than a reformatted file.

import { parseDocument, stringify, isMap, isScalar, type Document, type ToStringOptions } from 'yaml';
import type { Edit } from 'jsonc-parser';
import type { ValidationFix } from './validationFix';

type Ranged = { range?: [number, number, number] | null };

/** YAML text for a value written in place of an existing node. */
function renderValue(value: unknown): string {
  // A flow-style JSON rendering is valid YAML and stays on one line, which is
  // what an in-place replacement needs; plain scalars read better unquoted.
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'string' && /[\n\r]/.test(value)) { return JSON.stringify(value); }
    return stringify(value, { lineWidth: 0 }).trimEnd();
  }
  return JSON.stringify(value);
}

/** Lines of `text` without their terminators; a final line break adds no line. */
function linesOf(text: string): string[] {
  const lines = text.split('\n').map(line => (line.endsWith('\r') ? line.slice(0, -1) : line));
  if (lines[lines.length - 1] === '') { lines.pop(); }
  return lines;
}

/**
 * The serialiser options under which `doc` prints back line for line as `text`
 * — same number of lines, each with the same indentation and the same content
 * but for spacing inside it (an aligned comment, a padded flow collection) —
 * together with that printing. Indentation has to match exactly: it is what a
 * newly printed line will be written with.
 */
function alignedPrinting(doc: Document, text: string): { options: ToStringOptions; printed: string } | undefined {
  const squash = (line: string) => /^\s*/.exec(line)![0] + line.trim().replace(/\s+/g, '');
  const source = linesOf(text).map(squash);
  for (const indent of [2, 4]) {
    for (const indentSeq of [true, false]) {
      const options: ToStringOptions = { indent, indentSeq, lineWidth: 0 };
      const printed = doc.toString(options);
      const lines = linesOf(printed);
      if (lines.length === source.length && lines.every((line, i) => squash(line) === source[i])) {
        return { options, printed };
      }
    }
  }
  return undefined;
}

/**
 * Carry the difference between two printings of a document over to `text`,
 * whose lines correspond one-to-one with `before`'s: replace exactly the source
 * lines that changed, keeping the source's line endings and whether it ends
 * with one.
 */
function lineHunkEdit(text: string, before: string, after: string): Edit[] {
  const eol = text.includes('\r\n') ? '\r\n' : '\n';
  const was = linesOf(before);
  const now = linesOf(after);
  let head = 0;
  while (head < was.length && head < now.length && was[head] === now[head]) { head++; }
  let tail = 0;
  while (tail < was.length - head && tail < now.length - head
    && was[was.length - 1 - tail] === now[now.length - 1 - tail]) { tail++; }

  // Offset at which each source line starts, plus one past the last line.
  const starts = [0];
  for (let i = text.indexOf('\n'); i !== -1 && i + 1 < text.length; i = text.indexOf('\n', i + 1)) { starts.push(i + 1); }
  starts.push(text.length);

  const inserted = now.slice(head, now.length - tail);
  let start = starts[head];
  const end = starts[was.length - tail];
  let content = inserted.map(line => line + eol).join('');
  if (end === text.length && !text.endsWith('\n')) {
    // The change reaches an end of text that has no final line break: keep it so.
    if (head === was.length) { content = inserted.map(line => eol + line).join(''); }
    else if (inserted.length) { content = inserted.join(eol); }
    else if (head > 0) { start -= eol.length; }
  }
  return start === end && content === '' ? [] : [{ offset: start, length: end - start, content }];
}

/** Edits applying `fix` to YAML `text`; empty when it cannot be applied safely. */
export function yamlFixEdits(text: string, fix: ValidationFix): Edit[] {
  const doc = parseDocument(text);
  if (doc.errors.length) { return []; }
  const parentPath = fix.path.slice(0, -1);
  const name = fix.path[fix.path.length - 1];
  const parent = parentPath.length ? doc.getIn(parentPath, true) : doc.contents;

  switch (fix.kind) {
    case 'set-enum':
    case 'set-const':
    case 'coerce-type': {
      const node = (fix.path.length ? doc.getIn(fix.path, true) : doc.contents) as Ranged | undefined | null;
      const range = node?.range;
      if (!range) { return []; }
      const rendered = renderValue(fix.value);
      // A block collection's range runs on through its final line break, which
      // belongs to the line, not to the value being replaced.
      let end = range[1];
      while (end > range[0] && /\s/.test(text[end - 1])) { end--; }
      // `key:` with nothing after it is a null whose range is empty; writing a
      // value there needs the space the empty form did not have.
      const content = range[0] === end && text[range[0] - 1] === ':' ? ` ${rendered}` : rendered;
      return [{ offset: range[0], length: end - range[0], content }];
    }
    case 'rename-property': {
      if (!isMap(parent) || fix.newName === undefined || parent.has(fix.newName)) { return []; }
      const pair = parent.items.find(p => isScalar(p.key) && p.key.value === name);
      const range = (pair?.key as Ranged | undefined)?.range;
      if (!range) { return []; }
      return [{ offset: range[0], length: range[1] - range[0], content: renderValue(fix.newName) }];
    }
    case 'add-required':
    case 'remove-additional': {
      if (!isMap(parent)) { return []; }
      if (parent.has(name) !== (fix.kind === 'remove-additional')) { return []; }
      const aligned = alignedPrinting(doc, text);
      if (!aligned) { return []; }
      if (fix.kind === 'add-required') { parent.set(name, doc.createNode(fix.value)); }
      else { parent.delete(name); }
      return lineHunkEdit(text, aligned.printed, doc.toString(aligned.options));
    }
  }
}
