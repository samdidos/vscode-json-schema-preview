// Single place that knows how to read `specs/` at the repository root
// (S10-NFR-01): the data loader, the dynamic route, and the sidebar in
// config.ts all list spec files and parse titles through these helpers so the
// convention (`Fxx-*.md` / `Sxx-*.md`, `# ID — Title` H1) is encoded once.
import { readFileSync, readdirSync } from 'node:fs'
import { resolve } from 'node:path'

export const SPECS_DIR = resolve(__dirname, '../../specs')

export interface SpecFile {
  /** Spec id, e.g. "F01" or "S07". */
  id: string
  /** File basename, e.g. "F01-preview.md". */
  file: string
  /** Human title from the file's `# ID — Title` H1. */
  title: string
  kind: 'feature' | 'system'
  /** Raw markdown content of the spec file. */
  content: string
}

export function listSpecFiles(): SpecFile[] {
  return readdirSync(SPECS_DIR)
    .filter((file) => /^[FS]\d{2}-.*\.md$/.test(file))
    .sort()
    .map((file) => {
      const content = readFileSync(resolve(SPECS_DIR, file), 'utf-8')
      const h1 = /^#\s+\S+\s+—\s+(.+)$/m.exec(content)
      return {
        id: file.slice(0, 3),
        file,
        title: h1?.[1].trim() ?? file,
        kind: file.startsWith('F') ? ('feature' as const) : ('system' as const),
        content,
      }
    })
}
