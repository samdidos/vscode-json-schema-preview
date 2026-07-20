// Documentation depth metric (S07-SR-10..13): how many words of user-facing
// documentation each spec actually has, measured from the `<!-- spec:… -->`
// tags (S07), against how many words its complexity leads us to expect.
//
// Consumed by scripts/maturity-score.mjs (the Docs dimension's doc-coverage
// check) and by the docs site's build-time loaders (the per-spec coverage
// chart on the Docs dimension page and the "documented in" section on each
// spec page) — one computation, no hand-maintained numbers anywhere.
//
// Word attribution (S07-SR-10):
//   - `start`/`end` section pair  → the words between the tags
//   - inline tag                  → the words from the tag to the next
//     heading, next spec tag, or end of file — whichever comes first; when
//     that region is blank because the tag sits directly above a heading
//     (this repo's usual placement), the section UNDER that heading is
//     attributed instead
//   - a comma-list tag attributes its words to EVERY listed id; a
//     requirement-level id attributes to its parent spec
//   - overlapping regions for one spec in one file are merged, so no word is
//     double-counted for that spec
// Fenced code blocks and inline code spans are blanked before measuring:
// prose documents, code illustrates.
//
// Expected words (S07-SR-11): complexity is the number of *documentable*
// requirements (traceability status not planned/deferred; ids missing from
// the matrix count as documentable — matrix drift is check:traceability's
// problem, not this metric's).
import { readFileSync, readdirSync, statSync, existsSync } from 'fs';
import { join, relative, extname } from 'path';

/** Words of documentation expected per documentable requirement (S07-SR-11). */
export const WORDS_PER_REQUIREMENT = 40;
/** Floor: even the smallest spec deserves an intro's worth of words. */
export const MIN_EXPECTED_WORDS = 120;

const UNIMPLEMENTED_STATUSES = new Set(['planned', 'deferred']);
const REQ_ID = '[FS]\\d{2}-(?:FR|NFR|SR)-\\d+';
const DEF_RE = new RegExp(`\\*\\*(${REQ_ID})\\*\\*`, 'g');
const ID_TOKEN = '(?:[FS]\\d{2}(?:-(?:FR|NFR|SR)-\\d+)?)';
const TAG_RE = new RegExp(
  `<!--\\s*spec:\\s*(${ID_TOKEN}(?:\\s*,\\s*${ID_TOKEN})*)\\s*(start|end)?\\s*-->`,
  'g',
);
const HEADING_RE = /^(#{1,6})\s+(.+?)\s*$/gm;

// VitePress's own heading slugifier (@mdit-vue/shared), replicated exactly so
// generated anchors match the site's (S07-SR-13).
const rControl = /[\u0000-\u001f]/g;
const rSpecial = /[\s~`!@#$%^&*()\-_+=[\]{}|\\;:"'“”‘’<>,.?/]+/g;
const rCombining = /[\u0300-\u036F]/g;
export function slugify(str) {
  return str
    .normalize('NFKD')
    .replace(rCombining, '')
    .replace(rControl, '')
    .replace(rSpecial, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/^(\d)/, '_$1')
    .toLowerCase();
}

/** Blank code the same way check-doc-traceability.mjs does — but strictly
 *  length-preserving (fences become spaces, not collapsed newlines), so every
 *  offset in the stripped text is also valid in the raw text. Tag/heading
 *  positions are found on the stripped text; display text is sliced from raw. */
function stripCode(text) {
  const noFences = text.replace(/```[\s\S]*?```/g, (m) => m.replace(/[^\n]/g, ' '));
  return noFences.replace(/`(?:[^`\n]|\n(?!\n))*?`/g, (m) => m.replace(/[^\n]/g, ' '));
}

function countWords(text) {
  // Residual HTML comments (nested spec tags, editorial notes) are not prose.
  return text.replace(/<!--[\s\S]*?-->/g, ' ').split(/\s+/).filter(Boolean).length;
}

function specOf(id) {
  return /^([FS]\d{2})/.exec(id)?.[1];
}

function collectDocFiles(path_, acc = []) {
  if (!existsSync(path_)) return acc;
  const st = statSync(path_);
  if (st.isFile()) {
    if (extname(path_) === '.md') acc.push(path_);
    return acc;
  }
  for (const name of readdirSync(path_)) {
    // drafts are unpublished (excluded from the site build); .vitepress holds
    // config/theme, not documentation.
    if (name === 'node_modules' || name === 'drafts' || name === '.vitepress') continue;
    collectDocFiles(join(path_, name), acc);
  }
  return acc;
}

/** Map a scanned file to its docs-site page path ('/guide/commands'), or null
 *  for repository-only documents (README.md), which link to the repo host. */
function pageOf(rel) {
  if (!rel.startsWith('docs/')) return null;
  const p = rel.slice('docs/'.length).replace(/\.md$/, '');
  return '/' + (p.endsWith('index') ? p.slice(0, -'index'.length) : p);
}

/**
 * Compute the full depth metric for a repository root.
 * Returns { wordsPerRequirement, minExpectedWords, specs: [...] } where each
 * spec entry carries { id, title, file, documentableRequirements,
 * expectedWords, actualWords, coverage, sections: [{ file, page, heading,
 * anchor, words }] }. Specs with zero documentable requirements are excluded
 * (S07-SR-12 — documenting them is an error under S07-SR-09).
 */
export function computeDocCoverage(rootDir) {
  const specsDir = join(rootDir, 'specs');
  const matrix = JSON.parse(readFileSync(join(specsDir, 'traceability.json'), 'utf-8'));
  const statusOf = (id) => matrix.requirements?.[id]?.status;

  // Spec inventory: id, title, and documentable-requirement count.
  const specs = new Map();
  for (const name of readdirSync(specsDir).sort()) {
    if (!/^[FS]\d{2}-.*\.md$/.test(name)) continue;
    const text = readFileSync(join(specsDir, name), 'utf-8');
    const id = name.slice(0, 3);
    const title = /^#\s+\S+\s+—\s+(.+)$/m.exec(text)?.[1] ?? name;
    const reqIds = [...new Set([...text.matchAll(DEF_RE)].map((m) => m[1]))];
    const documentable = reqIds.filter((r) => !UNIMPLEMENTED_STATUSES.has(statusOf(r) ?? 'implemented'));
    if (documentable.length === 0) continue;
    specs.set(id, {
      id,
      title,
      file: name,
      documentableRequirements: documentable.length,
      expectedWords: Math.max(MIN_EXPECTED_WORDS, WORDS_PER_REQUIREMENT * documentable.length),
      actualWords: 0,
      coverage: 0,
      sections: [],
      _intervals: new Map(), // file -> [start, end][] on that file's stripped text
    });
  }

  // Scan the user-documentation set: README.md + docs/ (AGENTS.md is process
  // documentation for agents, deliberately not counted as user docs).
  const files = [join(rootDir, 'README.md'), ...collectDocFiles(join(rootDir, 'docs'))];
  for (const file of files) {
    if (!existsSync(file)) continue;
    const rel = relative(rootDir, file).split('\\').join('/');
    const raw = readFileSync(file, 'utf-8');
    const text = stripCode(raw);

    // Positions from the stripped text; display text from the raw line at the
    // same offsets (stripping is length-preserving), with markdown formatting
    // removed the way the renderer would — so anchors match the site's.
    const headings = [...text.matchAll(HEADING_RE)].map((m) => ({
      index: m.index,
      end: m.index + m[0].length,
      text: raw
        .slice(m.index, m.index + m[0].length)
        .replace(/^#{1,6}\s+/, '')
        .replace(/[*_`]/g, '')
        .trim(),
    }));
    const tags = [...text.matchAll(TAG_RE)].map((m) => ({
      index: m.index,
      end: m.index + m[0].length,
      ids: m[1].split(',').map((s) => s.trim()).filter(Boolean),
      kind: m[2], // 'start' | 'end' | undefined
    }));

    // Resolve each tag into an attributed region [from, to). Each region also
    // records which heading it belongs to (`heading`) for the section links.
    const regions = [];
    const stack = [];
    for (let i = 0; i < tags.length; i++) {
      const t = tags[i];
      if (t.kind === 'start') {
        stack.push(t);
      } else if (t.kind === 'end') {
        const open = stack.pop();
        if (!open) continue;
        // A pair usually sits under a heading; a pair wrapping a whole page
        // (tag above the H1) is labelled by the first heading it contains.
        const heading =
          [...headings].reverse().find((h) => h.index <= open.index) ??
          headings.find((h) => h.index >= open.end && h.index < t.index);
        regions.push({ from: open.end, to: t.index, ids: open.ids, heading });
        continue;
      } else {
        const nextHeading = headings.find((h) => h.index > t.end);
        const nextTag = tags[i + 1]?.index ?? text.length;
        let from = t.end;
        let to = Math.min(nextHeading?.index ?? text.length, nextTag);
        let heading = [...headings].reverse().find((h) => h.index <= t.index);
        if (!/\S/.test(text.slice(from, to)) && nextHeading && nextHeading.index < nextTag) {
          // The tag sits directly above a heading: it documents that heading's
          // section (the repo's usual placement) — attribute the section body.
          heading = nextHeading;
          from = nextHeading.end;
          const followingHeading = headings.find((h) => h.index > nextHeading.end)?.index ?? text.length;
          const followingTag = tags.find((x) => x.index > nextHeading.end)?.index ?? text.length;
          to = Math.min(followingHeading, followingTag);
        }
        regions.push({ from, to, ids: t.ids, heading });
      }
    }

    for (const region of regions) {
      const specIds = [...new Set(region.ids.map(specOf).filter(Boolean))];
      const words = countWords(text.slice(region.from, region.to));
      for (const sid of specIds) {
        const spec = specs.get(sid);
        if (!spec) continue; // unknown/undocumentable id — the checker owns erroring on it
        const list = spec._intervals.get(rel) ?? [];
        list.push([region.from, region.to]);
        spec._intervals.set(rel, list);
        spec.sections.push({
          file: rel,
          page: pageOf(rel),
          heading: region.heading?.text ?? rel,
          anchor: region.heading ? slugify(region.heading.text) : null,
          words,
        });
      }
    }

    // Merge each spec's intervals in this file and add the de-duplicated words.
    for (const spec of specs.values()) {
      const intervals = spec._intervals.get(rel);
      if (!intervals) continue;
      intervals.sort((a, b) => a[0] - b[0]);
      let [curFrom, curTo] = intervals[0];
      const merged = [];
      for (const [f, t] of intervals.slice(1)) {
        if (f <= curTo) curTo = Math.max(curTo, t);
        else { merged.push([curFrom, curTo]); [curFrom, curTo] = [f, t]; }
      }
      merged.push([curFrom, curTo]);
      for (const [f, t] of merged) spec.actualWords += countWords(text.slice(f, t));
      spec._intervals.delete(rel);
    }
  }

  const out = [...specs.values()].map(({ _intervals, ...spec }) => ({
    ...spec,
    coverage: Math.min(1, spec.actualWords / spec.expectedWords),
  }));
  return { wordsPerRequirement: WORDS_PER_REQUIREMENT, minExpectedWords: MIN_EXPECTED_WORDS, specs: out };
}

/** Mean per-spec coverage — the Docs dimension's doc-coverage earn (S07-SR-12). */
export function meanDocCoverage(rootDir) {
  const { specs } = computeDocCoverage(rootDir);
  if (specs.length === 0) return 0;
  return specs.reduce((s, x) => s + x.coverage, 0) / specs.length;
}
