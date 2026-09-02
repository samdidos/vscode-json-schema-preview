import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vitepress'
import { SPECS_DIR, listSpecFiles } from './specsSource'
import { readMaturityScore } from './maturitySource'

const readSpecJson = (name: string) =>
  JSON.parse(readFileSync(resolve(SPECS_DIR, name), 'utf-8'))

/** Compact advisory-metric indicator for a sidebar entry (S10-SR-11):
 *  T-shirt size, plus RICE where a value estimate exists. VitePress renders
 *  sidebar labels with `v-html`, so this markup is live — every interpolated
 *  value comes from the project's own committed JSON (a T-shirt enum and a
 *  number formatted here), never from user input. */
function specSidebarItems(kind: 'feature' | 'system') {
  const effort = readSpecJson('effort.json')
  const value = readSpecJson('value.json')
  return listSpecFiles()
    .filter((spec) => spec.kind === kind)
    .map((spec) => {
      const tshirt: string | undefined = effort.specs?.[spec.id]?.tshirt
      const points: number | undefined = effort.specs?.[spec.id]?.points
      const score: number | undefined = value.features?.[spec.id]?.score
      const rice = score && points ? (score / points).toFixed(2) : null
      const badges = [
        tshirt ? `<span class="spec-nav-badge">${tshirt}</span>` : '',
        rice ? `<span class="spec-nav-badge spec-nav-rice">${rice}</span>` : '',
      ].join('')
      return {
        text: `${spec.id} · ${spec.title}${badges}`,
        link: `/specs/${spec.id}`,
      }
    })
}

// Sidebar entries for the generated maturity criteria pages (S12-SR-03):
// built from maturity-score.json so a rubric change shows up with no config
// edit.
function maturitySidebarItems() {
  return readMaturityScore().dimensions.map((d) => ({
    text: d.label,
    link: `/maturity/${d.slug}`,
  }))
}

export default defineConfig({
  title: 'JSON Schema Preview',
  description: 'Preview, validate and edit JSON Schema documents directly in VS Code.',
  base: '/vscode-json-schema-preview/',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/vscode-json-schema-preview/logo.svg' }],
  ],

  // Draft blog posts live under docs/blog/drafts/ and must not be published
  // until they're ready — exclude them from the build so they never render as
  // a reachable page.
  srcExclude: ['**/drafts/**'],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'JSON Schema Preview',

    // Top nav mirrors each section's sidebar entry point as a dropdown (Guide,
    // Specs, Maturity all list their subpages) so a page is reachable without
    // first landing on the section index. GitHub is reachable via the social
    // icon (socialLinks) rather than a second nav link to the same place.
    nav: [
      {
        text: 'Guide',
        activeMatch: '/guide/',
        items: [
          { text: 'Introduction', link: '/guide/' },
          { text: 'Commands', link: '/guide/commands' },
          { text: 'Schema lifecycle', link: '/guide/lifecycle' },
          { text: 'AI & agent tools', link: '/guide/ai' },
          { text: 'CLI', link: '/guide/cli' },
          { text: 'Authentication', link: '/guide/authentication' },
          { text: 'Configuration', link: '/guide/configuration' },
          { text: 'Security & privacy', link: '/guide/security' },
          { text: 'Troubleshooting', link: '/guide/troubleshooting' },
        ],
      },
      {
        text: 'Specs',
        activeMatch: '/specs/',
        items: [
          { text: 'How it works', link: '/specs/' },
          { text: 'Requirement matrix', link: '/specs/matrix' },
          { text: 'Insights', link: '/specs/insights' },
        ],
      },
      {
        text: 'Maturity',
        activeMatch: '/maturity/',
        items: [
          { text: 'How it works', link: '/maturity/how-it-works' },
          { text: 'Scorecard', link: '/maturity/' },
        ],
      },
      { text: 'Delivery', link: '/delivery/', activeMatch: '/delivery/' },
      { text: 'Blog', link: '/blog/', activeMatch: '/blog/' },
    ],

    // Path-scoped sidebars: the guide sidebar lists every guide page with names
    // matching their titles; the blog gets its own. No entry restates a nav
    // label with a different name.
    sidebar: {
      '/guide/': [
        {
          text: 'Guide',
          items: [
            { text: 'Introduction', link: '/guide/' },
            { text: 'Commands', link: '/guide/commands' },
            { text: 'Schema lifecycle', link: '/guide/lifecycle' },
            { text: 'AI & agent tools', link: '/guide/ai' },
            { text: 'CLI', link: '/guide/cli' },
            { text: 'Authentication', link: '/guide/authentication' },
            { text: 'Configuration', link: '/guide/configuration' },
            { text: 'Security & privacy', link: '/guide/security' },
            { text: 'Troubleshooting', link: '/guide/troubleshooting' },
          ],
        },
      ],
      '/blog/': [
        {
          text: 'Blog',
          items: [
            { text: 'All posts', link: '/blog/' },
          ],
        },
      ],
      '/specs/': [
        {
          text: 'Specs',
          items: [
            { text: 'How it works', link: '/specs/' },
            { text: 'Requirement matrix', link: '/specs/matrix' },
            { text: 'Insights', link: '/specs/insights' },
          ],
        },
        { text: 'Feature specs', collapsed: true, items: specSidebarItems('feature') },
        { text: 'System specs', collapsed: true, items: specSidebarItems('system') },
      ],
      '/maturity/': [
        {
          text: 'Maturity',
          items: [
            { text: 'How it works', link: '/maturity/how-it-works' },
            { text: 'Scorecard', link: '/maturity/' },
          ],
        },
        { text: 'Dimensions', items: maturitySidebarItems() },
      ],
    },

    socialLinks: [
      { icon: 'github', link: 'https://github.com/samdidos/vscode-json-schema-preview' },
    ],

    footer: {
      message: 'Released under the <a href="https://github.com/samdidos/vscode-json-schema-preview/blob/main/LICENSE.md">MIT License</a>.',
      copyright: 'Copyright © 2026-present Samuel Cardinal',
    },

    search: { provider: 'local' },
  },
})
