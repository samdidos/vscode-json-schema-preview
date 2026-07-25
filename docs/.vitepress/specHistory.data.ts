// Build-time loader for each spec page's "Changes over time" section
// (S10-SR-14/15): the spec file's own git history *is* its changelog, so
// nothing under docs/ hand-maintains one — a change to specs/*.md shows up on
// the next docs build with no manual step (S10-NFR-01).
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { defineLoader } from 'vitepress'
import { SPECS_DIR, listSpecFiles } from './specsSource'

export interface SpecCommit {
  /** Full commit hash. */
  sha: string
  /** First 7 characters of `sha`, for display. */
  shortSha: string
  /** Author date, `YYYY-MM-DD`. */
  date: string
  /** Commit subject line. */
  subject: string
}

export type SpecHistoryData = Record<string, SpecCommit[]>

declare const data: SpecHistoryData
export { data }

const REPO_ROOT = resolve(SPECS_DIR, '..')
// Unit separator: won't appear in a commit subject, so splitting is exact.
const SEP = ''

/** `git log --follow` on one spec file, newest first. Returns [] (S10-SR-15's
 *  "no history available" case) rather than throwing when the file has no
 *  history reachable from this checkout (e.g. a shallow clone). */
export function readSpecHistory(file: string): SpecCommit[] {
  let out: string
  try {
    out = execFileSync(
      'git',
      ['log', '--follow', `--format=%H${SEP}%ad${SEP}%s`, '--date=short', '--', `specs/${file}`],
      { cwd: REPO_ROOT, encoding: 'utf-8' },
    )
  } catch {
    return []
  }
  return out
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [sha, date, subject] = line.split(SEP)
      return { sha, shortSha: sha.slice(0, 7), date, subject }
    })
}

export default defineLoader({
  watch: [`${SPECS_DIR}/*.md`],
  load(): SpecHistoryData {
    const out: SpecHistoryData = {}
    for (const { id, file } of listSpecFiles()) {
      out[id] = readSpecHistory(file)
    }
    return out
  },
})
