// Build-time loader for defect attribution (S19-SR-04): the `Fixes:` trailers
// in the git history ARE the record, so the counts are read from `git log` on
// every build and nothing under docs/ (or anywhere else) keeps a tally that
// could disagree with them.
//
// Fix commits predating the convention carry no trailer and are counted as
// unattributed (S19-SR-05) — never guessed at from the files they touched,
// which was measured and rejected: 8 fix commits landed on 29 specs because
// they share files like src/extension.ts.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { defineLoader } from 'vitepress'
import { SPECS_DIR } from './specsSource'

export interface AttributedFix {
  shortSha: string
  date: string
  subject: string
  /** Requirement ids named by this commit's `Fixes:` trailers. */
  requirements: string[]
}

export interface DefectsData {
  /** Requirement id → number of fixes naming it. */
  byRequirement: Record<string, number>
  /** Spec id → number of fixes naming any of its requirements. A commit that
   *  names two requirements of one spec counts once for the spec. */
  bySpec: Record<string, number>
  fixes: AttributedFix[]
  /** Fix commits carrying no trailer — predating the convention, or exempt. */
  unattributed: number
  /** Total fix commits seen, attributed or not. */
  totalFixes: number
}

declare const data: DefectsData
export { data }

const REPO_ROOT = resolve(SPECS_DIR, '..')
// Unit separator: cannot appear in a commit subject, so splitting is exact.
const SEP = ''
// Record separator between commits.
const REC = ''
const REQ_ID_RE = /^[FS]\d{2}-(?:FR|NFR|SR)-\d+$/

/** Every commit's hash, date, subject and body, newest first. Returns [] when
 *  git is unavailable (a tarball build), so the docs still build. */
function readLog(): { shortSha: string; date: string; subject: string; body: string }[] {
  let out: string
  try {
    out = execFileSync(
      'git',
      ['log', `--format=%h${SEP}%ad${SEP}%s${SEP}%b${REC}`, '--date=short'],
      { cwd: REPO_ROOT, encoding: 'utf-8', maxBuffer: 64 * 1024 * 1024 },
    )
  } catch {
    return []
  }
  return out
    .split(REC)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((record) => {
      const [shortSha, date, subject, body = ''] = record.split(SEP)
      return { shortSha, date, subject, body }
    })
}

export default defineLoader({
  // Nothing to watch: the history only changes on commit, which restarts the
  // dev server's build anyway.
  watch: [],
  load(): DefectsData {
    const byRequirement: Record<string, number> = {}
    const bySpec: Record<string, number> = {}
    const fixes: AttributedFix[] = []
    let totalFixes = 0
    let unattributed = 0

    for (const commit of readLog()) {
      if (!/^fix(\([^)]*\))?!?:/.test(commit.subject)) continue
      totalFixes++
      const ids = [
        ...new Set(
          commit.body
            .split(/\r?\n/)
            .flatMap((line) => {
              const m = /^fixes:\s*(.+?)\s*$/i.exec(line.trim())
              return m ? m[1].split(',').map((s) => s.trim()) : []
            })
            .filter((id) => REQ_ID_RE.test(id)),
        ),
      ]
      if (ids.length === 0) {
        unattributed++
        continue
      }
      fixes.push({
        shortSha: commit.shortSha,
        date: commit.date,
        subject: commit.subject,
        requirements: ids,
      })
      for (const id of ids) byRequirement[id] = (byRequirement[id] ?? 0) + 1
      // One commit counts once per spec even when it names several of its
      // requirements — otherwise a thorough fix would look like several bugs.
      for (const spec of new Set(ids.map((id) => id.split('-')[0]))) {
        bySpec[spec] = (bySpec[spec] ?? 0) + 1
      }
    }

    return { byRequirement, bySpec, fixes, unattributed, totalFixes }
  },
})
