// Dynamic route (S10-SR-06, S10-NFR-01): one docs page per spec file,
// generated at build time straight from `specs/*.md` at the repository root.
// The page template is `[id].md`; each spec's markdown becomes its
// `<!-- @content -->`.
import { listSpecFiles } from '../.vitepress/specsSource'

export default {
  paths() {
    return listSpecFiles().map(({ id, file, content }) => ({
      params: { id, file },
      // Relative links between spec files (e.g. `(F08-schema-cache.md)`)
      // must point at the sibling docs page, not the raw file.
      content: content.replace(/\(([FS]\d{2})-[a-z0-9-]+\.md\)/g, '(./$1)'),
    }))
  },
}
