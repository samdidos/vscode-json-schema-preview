#!/usr/bin/env node
// Documentation traceability checker (S07).
//
// Cross-references `<!-- spec:<IDs> -->` tags found in user-facing
// documentation against the spec identifiers defined in specs/*.md:
//   - feature ids   — derived from specs/F*.md / specs/S*.md filenames
//   - requirement ids — bold-defined inside spec bodies (e.g. **F12-FR-01**)
//
// A tag's <IDs> is a comma-separated list (one or more ids), and comes in two
// placements: inline (`<!-- spec:F13 -->`) or a matched section pair
// (`<!-- spec:F14 start -->` … `<!-- spec:F14 end -->`).
//
// Fails (exit 1) on:
//   - a tag referencing an id that does not exist (stale/mistyped)
//   - an unbalanced start/end section tag, or a start/end pair whose id sets
//     don't match
// Warns (does not fail) on:
//   - a feature spec with no documentation tag anywhere
//
// Usage:
//   node scripts/check-doc-traceability.mjs
//
import { readFileSync, existsSync, readdirSync, statSync } from 'fs';
import { join, dirname, relative, extname } from 'path';
import { fileURLToPath } from 'url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const SPECS_DIR = join(ROOT, 'specs');

// Required: every feature spec should be reachable from these (S07-SR-03).
const REQUIRED_DOC_PATHS = [join(ROOT, 'README.md'), join(ROOT, 'docs')];
// Optional: validated for correctness if present, but not required to cover
// every feature — process/agent docs, not end-user docs (S07-SR-04).
const OPTIONAL_DOC_PATHS = [join(ROOT, 'AGENTS.md')];

const FEATURE_ID_RE = /^([FS]\d{2})-/;                      // from spec filenames
const REQ_ID = '[FS]\\d{2}-(?:FR|NFR|SR)-\\d+';
const DEF_RE = new RegExp(`\\*\\*(${REQ_ID})\\*\\*`, 'g');    // requirement def sites
const ID_TOKEN = '(?:[FS]\\d{2}(?:-(?:FR|NFR|SR)-\\d+)?)';    // a feature id or a requirement id
const TAG_RE = new RegExp(
  `<!--\\s*spec:\\s*(${ID_TOKEN}(?:\\s*,\\s*${ID_TOKEN})*)\\s*(start|end)?\\s*-->`,
  'g',
);

// --- helpers ---------------------------------------------------------------

function collectMarkdownFiles(path_) {
  if (!existsSync(path_)) return [];
  const stat = statSync(path_);
  if (stat.isFile()) return extname(path_) === '.md' ? [path_] : [];
  const acc = [];
  for (const name of readdirSync(path_)) {
    if (name === 'node_modules') continue;
    const full = join(path_, name);
    const st = statSync(full);
    if (st.isDirectory()) acc.push(...collectMarkdownFiles(full));
    else if (extname(full) === '.md') acc.push(full);
  }
  return acc;
}

function collectFeatureIds() {
  const ids = new Set();
  for (const name of readdirSync(SPECS_DIR)) {
    const m = FEATURE_ID_RE.exec(name);
    if (m) ids.add(m[1]);
  }
  return ids;
}

function collectRequirementIds() {
  const ids = new Set();
  for (const name of readdirSync(SPECS_DIR)) {
    if (!name.endsWith('.md')) continue;
    const text = readFileSync(join(SPECS_DIR, name), 'utf-8');
    for (const m of text.matchAll(DEF_RE)) ids.add(m[1]);
  }
  return ids;
}

function featureOf(id) {
  const m = /^([FS]\d{2})/.exec(id);
  return m ? m[1] : undefined;
}

function lineAt(text, index) {
  return text.slice(0, index).split('\n').length;
}

// Blank out fenced code blocks (preserving line count) so documentation that
// *shows* the tag syntax as an example doesn't get parsed as a real tag.
function stripFencedCode(text) {
  return text.replace(/```[\s\S]*?```/g, m => '\n'.repeat((m.match(/\n/g) ?? []).length));
}

/** Scan one file's tags: validates ids, pairs start/end sections, and records
 *  which features they document. Appends to `errors`/`documented` in place. */
function scanFile(file, knownFeatureIds, knownReqIds, errors, documented) {
  const raw = readFileSync(file, 'utf-8');
  const text = stripFencedCode(raw);
  const rel = relative(ROOT, file);
  const stack = []; // { idsKey, idsRaw, line }

  for (const m of text.matchAll(TAG_RE)) {
    const idsRaw = m[1].split(',').map(s => s.trim()).filter(Boolean);
    const kind = m[2]; // 'start' | 'end' | undefined (inline)
    const line = lineAt(text, m.index);
    const tagText = `spec:${idsRaw.join(',')}${kind ? ' ' + kind : ''}`;

    for (const id of idsRaw) {
      if (!knownFeatureIds.has(id) && !knownReqIds.has(id)) {
        errors.push(`${rel}:${line}: unknown spec id "${id}" in <!-- ${tagText} -->`);
        continue;
      }
      const feature = featureOf(id);
      if (feature) documented.add(feature);
    }

    if (kind === 'start') {
      stack.push({ idsKey: [...idsRaw].sort().join(','), idsRaw, line });
    } else if (kind === 'end') {
      const idsKey = [...idsRaw].sort().join(',');
      if (stack.length === 0) {
        errors.push(`${rel}:${line}: <!-- ${tagText} --> has no matching start tag`);
        continue;
      }
      const top = stack[stack.length - 1];
      if (top.idsKey !== idsKey) {
        errors.push(
          `${rel}:${line}: <!-- ${tagText} --> does not match the innermost open ` +
          `<!-- spec:${top.idsRaw.join(',')} start --> (line ${top.line}) — ids must match exactly`
        );
        continue;
      }
      stack.pop();
    }
  }

  for (const frame of stack) {
    errors.push(`${rel}:${frame.line}: <!-- spec:${frame.idsRaw.join(',')} start --> has no matching end tag`);
  }
}

// --- main --------------------------------------------------------------------

const knownFeatureIds = collectFeatureIds();
const knownReqIds = collectRequirementIds();
const documented = new Set();
const errors = [];

const requiredFiles = REQUIRED_DOC_PATHS.flatMap(collectMarkdownFiles);
const optionalFiles = OPTIONAL_DOC_PATHS.flatMap(collectMarkdownFiles);

for (const file of [...requiredFiles, ...optionalFiles]) {
  scanFile(file, knownFeatureIds, knownReqIds, errors, documented);
}

const allFeatures = [...knownFeatureIds].sort();
const undocumented = allFeatures.filter(f => !documented.has(f));

console.log('Documentation traceability');
console.log('─'.repeat(48));
console.log(`Feature specs         : ${allFeatures.length}`);
console.log(`Documented            : ${allFeatures.length - undocumented.length} (${Math.round(((allFeatures.length - undocumented.length) / allFeatures.length) * 100)}%)`);
console.log(`Scanned files         : ${requiredFiles.length} required, ${optionalFiles.length} optional`);

if (undocumented.length) {
  console.log(`\n⚠ ${undocumented.length} undocumented feature(s):`);
  for (const f of undocumented) console.log(`  - ${f} has no <!-- spec:${f} --> (or requirement-level) tag in any scanned doc`);
}

if (errors.length) {
  console.log(`\n✗ ${errors.length} error(s):`);
  for (const e of errors) console.log(`  - ${e}`);
  console.log('\nDocumentation traceability check failed.');
  process.exit(1);
}

console.log('\n✓ Documentation traceability check passed.');
