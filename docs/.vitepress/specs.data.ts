// Build-time loader for the Specs section (S10-SR-03, S10-NFR-01): joins the
// spec files with the traceability matrix from `specs/` at the repository
// root, so the site is always generated from the source of truth — nothing
// under docs/ duplicates a title, requirement id, or status by hand.
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineLoader } from 'vitepress'
import { SPECS_DIR, listSpecFiles } from './specsSource'
// Types generated from specs/traceability.schema.json by the project's own F18
// generator (S11) — the matrix shape is never re-declared by hand here.
import type { TraceabilityMatrix, Status } from './traceability.types'

export interface SpecRequirement {
  id: string
  status: Status
  impl: string[]
  note?: string
}

/** Advisory estimates joined onto a spec for the matrix and insights page
 *  (S10-SR-09/12). Absent rather than zeroed when a spec is not scored: a
 *  system spec has no customer-value estimate by design (S16-SR-06). */
export interface SpecMetrics {
  /** S13 story points and T-shirt size — every spec has these. */
  points: number | null
  tshirt: string | null
  /** S16 customer value — feature specs only. */
  value: number | null
  tier: string | null
  /** value ÷ points, derived here and never stored (S16-SR-05). */
  rice: number | null
}

export interface SpecEntry {
  /** Spec id, e.g. "F01" or "S07". */
  id: string
  /** File basename, e.g. "F01-preview.md" — used for repo links. */
  file: string
  /** Human title from the file's H1, e.g. "Schema Preview Panel". */
  title: string
  kind: 'feature' | 'system'
  requirements: SpecRequirement[]
  /** Requirement count per status, e.g. { implemented: 10, manual: 2 }. */
  counts: Record<string, number>
  /** Requirements carrying at least one [ID] test tag. */
  tagged: number
  metrics: SpecMetrics
}

export interface SpecsData {
  specs: SpecEntry[]
  /** Status name → human description, from traceability.json. */
  statuses: Record<string, string>
}

declare const data: SpecsData
export { data }

/** Requirement ids carrying at least one `[ID]` tag in a test title. Test
 *  coverage is auto-discovered from the tags, exactly as the traceability
 *  checker discovers it — never listed by hand. */
function taggedRequirementIds(): Set<string> {
  const testDir = resolve(SPECS_DIR, '..', 'src', 'test')
  const tags = new Set<string>()
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = resolve(dir, entry.name)
      if (entry.isDirectory()) walk(full)
      else if (entry.name.endsWith('.ts')) {
        for (const m of readFileSync(full, 'utf-8').matchAll(/\[([FS]\d{2}-(?:FR|NFR|SR)-\d+)\]/g)) {
          tags.add(m[1])
        }
      }
    }
  }
  if (existsSync(testDir)) walk(testDir)
  return tags
}

export default defineLoader({
  watch: [
    `${SPECS_DIR}/*.md`,
    `${SPECS_DIR}/traceability.json`,
    `${SPECS_DIR}/effort.json`,
    `${SPECS_DIR}/value.json`,
  ],
  load(): SpecsData {
    const matrix = JSON.parse(
      readFileSync(resolve(SPECS_DIR, 'traceability.json'), 'utf-8'),
    ) as TraceabilityMatrix
    const effort = JSON.parse(readFileSync(resolve(SPECS_DIR, 'effort.json'), 'utf-8'))
    const value = JSON.parse(readFileSync(resolve(SPECS_DIR, 'value.json'), 'utf-8'))
    const tagged = taggedRequirementIds()

    // Group matrix requirements by their spec prefix (F01, S07, …).
    const bySpec = new Map<string, SpecRequirement[]>()
    for (const [id, entry] of Object.entries(matrix.requirements)) {
      const spec = id.split('-')[0]
      const list = bySpec.get(spec) ?? []
      list.push({ id, status: entry.status, impl: entry.impl ?? [], note: entry.note })
      bySpec.set(spec, list)
    }

    const specs: SpecEntry[] = listSpecFiles().map(({ id, file, title, kind }) => {
      const requirements = (bySpec.get(id) ?? []).sort((a, b) => a.id.localeCompare(b.id))
      const counts: Record<string, number> = {}
      for (const r of requirements) counts[r.status] = (counts[r.status] ?? 0) + 1
      const e = effort.specs?.[id]
      const v = value.features?.[id]
      const points = e?.points ?? null
      const metrics: SpecMetrics = {
        points,
        tshirt: e?.tshirt ?? null,
        value: v?.score ?? null,
        tier: v?.tier ?? null,
        rice: v && points ? Math.round((v.score / points) * 100) / 100 : null,
      }
      return {
        id,
        file,
        title,
        kind,
        requirements,
        counts,
        tagged: requirements.filter((r) => tagged.has(r.id)).length,
        metrics,
      }
    })

    return { specs, statuses: matrix.statuses }
  },
})
