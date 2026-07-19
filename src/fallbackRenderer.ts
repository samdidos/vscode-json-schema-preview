// Pure, dependency-free JSON Schema → HTML renderer used as a fallback when the
// `json-schema-for-humans` Python tool (or a Python interpreter) is unavailable,
// so a schema is still previewable. See specs/F01-preview.md (F01-FR-21/22) and
// the accessibility floor in specs/S06-accessibility.md (S06-SR-04/05/07).
//
// This module is intentionally self-contained and never throws on malformed
// input — a preview should degrade gracefully, not crash.

import { sanitizeHtml } from './webviewUtils';

type Sub = Record<string, unknown>;

// A no-script static page: default-src 'none' with only inline styles allowed.
const FALLBACK_CSP =
  `<meta http-equiv="Content-Security-Policy" ` +
  `content="default-src 'none'; style-src 'unsafe-inline'; img-src data:;">`;

// Dark theme with body text (#d4d4d4 on #1e1e1e) meeting WCAG AA contrast.
const FALLBACK_CSS = `
  body{font-family:var(--vscode-font-family,-apple-system,'Segoe UI',sans-serif);
       background:#1e1e1e;color:#d4d4d4;margin:0;padding:24px 32px 48px;line-height:1.5;font-size:13px}
  main{max-width:900px}
  h1{font-size:20px;margin:0 0 4px}
  h2{font-size:15px;margin:24px 0 8px;border-bottom:1px solid #3c3c3c;padding-bottom:4px}
  h3{font-size:13px;margin:18px 0 6px;color:#9cdcfe}
  p{margin:4px 0}
  .meta{color:#6a9955;font-size:12px}
  .type .k,.k{color:#9d9d9d}
  code{background:#252526;border-radius:3px;padding:1px 5px;font-family:'Cascadia Code',Consolas,monospace}
  table{border-collapse:collapse;width:100%;margin:6px 0 4px;font-size:13px}
  th,td{text-align:left;vertical-align:top;padding:6px 10px;border-bottom:1px solid #3c3c3c}
  th{color:#9d9d9d;font-weight:600;white-space:nowrap}
  td.req{color:#f47067;white-space:nowrap}
`;

const MAX_DEPTH = 3;

function s(v: unknown): string {
  return sanitizeHtml(String(v));
}

function asObject(v: unknown): Sub | undefined {
  return v && typeof v === 'object' && !Array.isArray(v) ? (v as Sub) : undefined;
}

/** Human-readable type label for a subschema. Never throws. */
export function describeType(sub: unknown): string {
  const o = asObject(sub);
  if (!o) {return 'any';}
  if (typeof o.$ref === 'string') {return `$ref: ${o.$ref}`;}
  if (Array.isArray(o.type)) {return o.type.map(String).join(' | ');}
  if (typeof o.type === 'string') {
    if (o.type === 'array' && asObject(o.items)) {return `array<${describeType(o.items)}>`;}
    return o.type;
  }
  if (Array.isArray(o.enum)) {return 'enum';}
  if (asObject(o.properties)) {return 'object';}
  return 'any';
}

/** Renders the `properties` of a schema as a table, recursing one level into nested objects. */
function renderProperties(schema: Sub, depth: number): string {
  const props = asObject(schema.properties);
  if (!props) {return '';}
  const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : []);
  const names = Object.keys(props);
  if (names.length === 0) {return '';}

  const rows = names.map(name => {
    const sub = asObject(props[name]) ?? {};
    const desc = typeof sub.description === 'string' ? sub.description : '';
    // Text label ("Yes"/"—"), never colour alone (S06-SR-07).
    const req = required.has(name) ? '<td class="req">Yes</td>' : '<td>—</td>';
    return `<tr><td><code>${s(name)}</code></td><td>${s(describeType(sub))}</td>` +
      `${req}<td>${s(desc)}</td></tr>`;
  }).join('\n');

  let html = `<table><thead><tr><th>Property</th><th>Type</th><th>Required</th>` +
    `<th>Description</th></tr></thead><tbody>${rows}</tbody></table>`;

  // Recurse into nested object properties as sub-sections (semantic headings so
  // the doc is navigable by screen-reader heading commands — S06-SR-04).
  if (depth < MAX_DEPTH) {
    for (const name of names) {
      const sub = asObject(props[name]);
      if (sub && asObject(sub.properties)) {
        html += `\n<h3>${s(name)}</h3>\n${renderProperties(sub, depth + 1)}`;
      }
    }
  }
  return html;
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8">
${FALLBACK_CSP}
<title>${s(title)}</title>
<style>${FALLBACK_CSS}</style></head>
<body><main>${body}</main></body></html>`;
}

/**
 * Render a parsed JSON Schema to a self-contained HTML documentation page.
 * `opts.filename` is used as the heading when the schema has no `title`.
 */
export function renderSchemaHtml(schema: unknown, opts: { filename?: string } = {}): string {
  const root = asObject(schema) ?? {};
  const title = typeof root.title === 'string' && root.title.trim()
    ? root.title
    : (opts.filename ?? 'JSON Schema');

  const parts: string[] = [`<h1>${s(title)}</h1>`];
  parts.push(`<p class="meta">Rendered by the built-in fallback (the json-schema-for-humans Python tool is unavailable).</p>`);
  parts.push(`<p class="type"><span class="k">type:</span> ${s(describeType(root))}</p>`);
  if (typeof root.description === 'string' && root.description.trim()) {
    parts.push(`<p class="desc">${s(root.description)}</p>`);
  }
  const propsHtml = renderProperties(root, 2);
  if (propsHtml) {
    parts.push(`<h2>Properties</h2>`, propsHtml);
  }
  return page(title, parts.join('\n'));
}

/**
 * True when a generation error indicates the Python interpreter or the
 * json-schema-for-humans package is unavailable (as opposed to a schema-level
 * error), so the caller can render the pure-JS fallback instead (F01-FR-21).
 */
export function isToolingUnavailable(message: string): boolean {
  return /spawn.*ENOENT|ENOENT|not found|No such file|No module named|ModuleNotFoundError|pip install|pip is not available|Could not install/i.test(
    message,
  );
}
