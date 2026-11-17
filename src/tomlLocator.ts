// F11 — a positional scan of a TOML document (pure, VS Code-free).
//
// `smol-toml` parses TOML to plain values and keeps no source positions, so on
// its own it cannot say *where* `/server/port` lives. This module scans the same
// text into a lightweight tree that records, for every key, table, array and
// value, the source span it occupies — enough to put a diagnostic on the exact
// key (F11-FR-15) and to edit a value, key or line in place (F21-FR-10..13).
//
// It is a locator, not a validator: it assumes text the real parser already
// accepted, keeps no values, and gives up (returns `undefined`) on anything it
// does not recognise rather than guessing a position.

export interface TomlSpan { start: number; end: number; }

export interface TomlNode {
  kind: 'table' | 'array' | 'value';
  /** The key token that introduced this node (its last key segment), quotes included. */
  key?: TomlSpan;
  /** The value literal: a scalar, an inline table or an array. Absent for a
   *  table that exists only through `[headers]` or dotted keys. */
  value?: TomlSpan;
  /** The whole `key = value` statement including its line break, for removal.
   *  Only set for a pair that owns its line(s) in a root or `[header]` table. */
  statement?: TomlSpan;
  /** Tables only — where a new `key = value` line can be inserted. Absent for
   *  inline tables and tables implied by dotted keys, which have no line of
   *  their own to add to. */
  insertAt?: number;
  children?: Map<string, TomlNode>;
  items?: TomlNode[];
}

class ScanError extends Error {}

const BARE_KEY = /[A-Za-z0-9_-]/;

class Scanner {
  i = 0;
  constructor(readonly text: string) {}

  fail(): never { throw new ScanError(); }

  /** Skip spaces and tabs. */
  ws(): void {
    while (this.text[this.i] === ' ' || this.text[this.i] === '\t') { this.i++; }
  }

  /** Skip whitespace, line breaks and comments. */
  trivia(): void {
    for (;;) {
      const c = this.text[this.i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') { this.i++; }
      else if (c === '#') { this.toLineEnd(); }
      else { return; }
    }
  }

  /** Advance to the line break (not past it). */
  toLineEnd(): void {
    while (this.i < this.text.length && this.text[this.i] !== '\n') { this.i++; }
  }

  /** Consume the rest of the line — optional comment, then the line break. */
  endOfStatement(): void {
    this.ws();
    if (this.text[this.i] === '#') { this.toLineEnd(); }
    if (this.text[this.i] === '\r') { this.i++; }
    if (this.text[this.i] === '\n') { this.i++; }
    else if (this.i < this.text.length) { this.fail(); }
  }

  /** A quoted string starting at the cursor; returns its span, quotes included. */
  string(): TomlSpan {
    const start = this.i;
    const quote = this.text[this.i];
    const triple = this.text.startsWith(quote.repeat(3), this.i);
    const close = triple ? quote.repeat(3) : quote;
    this.i += close.length;
    for (;;) {
      if (this.i >= this.text.length) { this.fail(); }
      if (quote === '"' && this.text[this.i] === '\\') { this.i += 2; continue; }
      if (!triple && this.text[this.i] === '\n') { this.fail(); }
      if (this.text.startsWith(close, this.i)) {
        this.i += close.length;
        // A multi-line string may end with up to two extra quotes that belong
        // to its content (`""""a""""` is the string `"a"`).
        if (triple) { while (this.text[this.i] === quote) { this.i++; } }
        return { start, end: this.i };
      }
      this.i++;
    }
  }

  /** One key segment — bare or quoted. */
  keySegment(): { name: string; span: TomlSpan } {
    const c = this.text[this.i];
    if (c === '"' || c === "'") {
      const span = this.string();
      const raw = this.text.slice(span.start + 1, span.end - 1);
      return { name: c === '"' ? unescapeBasic(raw) : raw, span };
    }
    const start = this.i;
    while (this.i < this.text.length && BARE_KEY.test(this.text[this.i])) { this.i++; }
    if (this.i === start) { this.fail(); }
    return { name: this.text.slice(start, this.i), span: { start, end: this.i } };
  }

  /** A dotted key path: `a."b c".d`. */
  keyPath(): Array<{ name: string; span: TomlSpan }> {
    const path = [this.keySegment()];
    for (;;) {
      this.ws();
      if (this.text[this.i] !== '.') { return path; }
      this.i++;
      this.ws();
      path.push(this.keySegment());
    }
  }

  value(): TomlNode {
    const c = this.text[this.i];
    if (c === '"' || c === "'") { return { kind: 'value', value: this.string() }; }
    if (c === '[') { return this.array(); }
    if (c === '{') { return this.inlineTable(); }
    const start = this.i;
    while (this.i < this.text.length && !',]}#\n\r'.includes(this.text[this.i])) { this.i++; }
    let end = this.i;
    while (end > start && (this.text[end - 1] === ' ' || this.text[end - 1] === '\t')) { end--; }
    if (end === start) { this.fail(); }
    return { kind: 'value', value: { start, end } };
  }

  array(): TomlNode {
    const start = this.i++;
    const items: TomlNode[] = [];
    for (;;) {
      this.trivia();
      if (this.text[this.i] === ']') { break; }
      items.push(this.value());
      this.trivia();
      if (this.text[this.i] === ',') { this.i++; continue; }
      if (this.text[this.i] !== ']') { this.fail(); }
    }
    this.i++;
    return { kind: 'array', value: { start, end: this.i }, items };
  }

  inlineTable(): TomlNode {
    const start = this.i++;
    const table: TomlNode = { kind: 'table', children: new Map() };
    for (;;) {
      this.trivia();
      if (this.text[this.i] === '}') { break; }
      const path = this.keyPath();
      this.ws();
      if (this.text[this.i] !== '=') { this.fail(); }
      this.i++;
      this.ws();
      const node = this.value();
      node.key = path[path.length - 1].span;
      descend(table, path.slice(0, -1)).children!.set(path[path.length - 1].name, node);
      this.trivia();
      if (this.text[this.i] === ',') { this.i++; continue; }
      if (this.text[this.i] !== '}') { this.fail(); }
    }
    this.i++;
    table.value = { start, end: this.i };
    return table;
  }
}

/** TOML basic-string escapes are a near-subset of JSON's; anything JSON cannot
 *  decode (`\U0001F600`, `\e`) keeps its raw spelling, which only matters for a
 *  key nobody could address by pointer anyway. */
function unescapeBasic(raw: string): string {
  try {
    return JSON.parse(`"${raw}"`) as string;
  } catch {
    return raw;
  }
}

/** Walk (creating as needed) the tables named by `path` under `table`. A
 *  segment that names an array of tables continues into its latest element. */
function descend(table: TomlNode, path: Array<{ name: string; span: TomlSpan }>): TomlNode {
  let current = table;
  for (const segment of path) {
    let next = current.children!.get(segment.name);
    if (!next) {
      next = { kind: 'table', key: segment.span, children: new Map() };
      current.children!.set(segment.name, next);
    }
    if (next.kind === 'array' && next.items!.length) { next = next.items![next.items!.length - 1]; }
    if (next.kind !== 'table' || !next.children) { throw new ScanError(); }
    current = next;
  }
  return current;
}

/**
 * Scan `text` into a positional tree rooted at the document's root table, or
 * `undefined` when the text is not TOML this scanner understands. Never throws.
 */
export function scanToml(text: string): TomlNode | undefined {
  const s = new Scanner(text);
  const root: TomlNode = { kind: 'table', children: new Map(), insertAt: 0 };
  let current = root;
  let rootHasPairs = false;
  try {
    for (;;) {
      s.trivia();
      if (s.i >= text.length) { break; }
      // A statement owns its whole line, indentation included.
      let lineStart = s.i;
      while (lineStart > 0 && (text[lineStart - 1] === ' ' || text[lineStart - 1] === '\t')) { lineStart--; }

      if (text.startsWith('[[', s.i)) {
        s.i += 2;
        s.ws();
        const path = s.keyPath();
        s.ws();
        if (!text.startsWith(']]', s.i)) { s.fail(); }
        s.i += 2;
        s.endOfStatement();
        const last = path[path.length - 1];
        const parent = descend(root, path.slice(0, -1));
        let array = parent.children!.get(last.name);
        if (!array) {
          array = { kind: 'array', key: last.span, items: [] };
          parent.children!.set(last.name, array);
        }
        if (array.kind !== 'array' || array.value) { s.fail(); }
        current = { kind: 'table', key: last.span, children: new Map(), insertAt: s.i };
        array.items!.push(current);
      } else if (text[s.i] === '[') {
        s.i++;
        s.ws();
        const path = s.keyPath();
        s.ws();
        if (text[s.i] !== ']') { s.fail(); }
        s.i++;
        s.endOfStatement();
        current = descend(root, path);
        if (current.value) { s.fail(); }
        current.key = path[path.length - 1].span;
        current.insertAt = s.i;
      } else {
        const path = s.keyPath();
        s.ws();
        if (text[s.i] !== '=') { s.fail(); }
        s.i++;
        s.ws();
        const node = s.value();
        s.endOfStatement();
        const last = path[path.length - 1];
        node.key = last.span;
        // Only a plain `key = value` line can be removed as a unit: a dotted
        // key shares its statement with the tables it implies.
        if (path.length === 1) { node.statement = { start: lineStart, end: s.i }; }
        descend(current, path.slice(0, -1)).children!.set(last.name, node);
        if (current === root) { rootHasPairs = true; }
        current.insertAt = s.i;
      }
    }
  } catch (e) {
    if (e instanceof ScanError) { return undefined; }
    /* c8 ignore next */
    throw e;
  }
  // With no root pairs, a new root key goes before the first header (offset 0);
  // `insertAt` already tracks the end of the last root pair otherwise.
  if (!rootHasPairs) { root.insertAt = 0; }
  return root;
}

/** The node at JSON-Pointer `segments` under `root`, or `undefined`. */
export function findTomlNode(root: TomlNode | undefined, segments: string[]): TomlNode | undefined {
  let current = root;
  for (const segment of segments) {
    if (!current) { return undefined; }
    if (current.kind === 'table') { current = current.children?.get(segment); }
    else if (current.kind === 'array' && /^\d+$/.test(segment)) { current = current.items?.[Number(segment)]; }
    else { return undefined; }
  }
  return current;
}

/**
 * Source span of the node at `segments`: its key when it has one (so a
 * diagnostic lands on the property name, as for JSON and YAML), else its value.
 */
export function locateTomlPath(text: string, segments: string[]): TomlSpan | undefined {
  const node = findTomlNode(scanToml(text), segments);
  return node?.key ?? node?.value;
}
