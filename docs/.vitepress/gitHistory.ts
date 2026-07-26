// Shared git-history helpers (S10-SR-14/15/17): the spec file's own commit
// history *is* its changelog, so nothing under docs/ hand-maintains one — a
// change to specs/*.md, or a new release, shows up on the next docs build
// with no manual step (S10-NFR-01). Split out of specHistory.data.ts so
// specs.data.ts can join a spec's history against release commits without
// importing another VitePress data loader.
import { execFileSync } from 'node:child_process'
import { resolve } from 'node:path'
import { SPECS_DIR } from './specsSource'

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

const REPO_ROOT = resolve(SPECS_DIR, '..')
// ASCII unit separator: won't appear in a commit subject, so splitting is
// exact even if the subject itself contains other punctuation.
const SEP = '\x1f'

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

// release-please's release-PR merge commit, e.g. "chore(main): release 0.16.0".
const RELEASE_SUBJECT = /^chore\(main\): release (\d+\.\d+\.\d+)$/

export type SpecReleaseState = 'released' | 'unreleased' | 'unknown'

export interface SpecRelease {
  version: string | null
  state: SpecReleaseState
}

/** Resolves, for a spec's oldest history commit, the version of the first
 *  release-please commit that shipped it (S10-SR-17). Reads the full commit
 *  log reachable from HEAD once and reuses it for every spec, rather than
 *  spawning a `git log` per spec. */
export function buildReleaseResolver(): (creationSha: string | undefined) => SpecRelease {
  let out: string
  try {
    out = execFileSync('git', ['log', '--reverse', `--format=%H${SEP}%s`], {
      cwd: REPO_ROOT,
      encoding: 'utf-8',
    })
  } catch {
    return () => ({ version: null, state: 'unknown' })
  }
  const order = new Map<string, number>()
  const releases: { index: number; version: string }[] = []
  out
    .split('\n')
    .filter(Boolean)
    .forEach((line, index) => {
      const [sha, subject] = line.split(SEP)
      order.set(sha, index)
      const m = RELEASE_SUBJECT.exec(subject)
      if (m) releases.push({ index, version: m[1] })
    })

  return (creationSha) => {
    if (!creationSha) return { version: null, state: 'unknown' }
    const idx = order.get(creationSha)
    if (idx === undefined) return { version: null, state: 'unknown' }
    const shipped = releases.find((r) => r.index >= idx)
    return shipped
      ? { version: shipped.version, state: 'released' }
      : { version: null, state: 'unreleased' }
  }
}
