import { defineConfig } from 'vitepress'
import { listSpecFiles } from './specsSource'
import { readMaturityScore } from './maturitySource'

// Sidebar entries for the generated spec pages (S10-SR-01): built from the
// spec files themselves so a new spec shows up with no config edit.
function specSidebarItems(kind: 'feature' | 'system') {
  return listSpecFiles()
    .filter((spec) => spec.kind === kind)
    .map((spec) => ({ text: `${spec.id} · ${spec.title}`, link: `/specs/${spec.id}` }))
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

    // Top nav is high-level destinations only; the individual guide pages live
    // in the left sidebar (below) so the two never duplicate each other. GitHub
    // is reachable via the social icon (socialLinks) rather than a second nav
    // link to the same place.
    nav: [
      { text: 'Guide', link: '/guide/', activeMatch: '/guide/' },
      {
        text: 'Specs',
        activeMatch: '/specs/',
        items: [
          { text: 'How specs work', link: '/specs/' },
          { text: 'Requirement matrix', link: '/specs/matrix' },
        ],
      },
      {
        text: 'Maturity',
        activeMatch: '/maturity/',
        items: [
          { text: 'Scorecard', link: '/maturity/' },
          { text: 'How it works', link: '/maturity/how-it-works' },
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
            { text: 'CLI', link: '/guide/cli' },
            { text: 'Authentication', link: '/guide/authentication' },
            { text: 'Configuration', link: '/guide/configuration' },
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
            { text: 'How specs work', link: '/specs/' },
            { text: 'Requirement matrix', link: '/specs/matrix' },
          ],
        },
        { text: 'Feature specs', collapsed: true, items: specSidebarItems('feature') },
        { text: 'System specs', collapsed: true, items: specSidebarItems('system') },
      ],
      '/maturity/': [
        {
          text: 'Maturity',
          items: [
            { text: 'Scorecard', link: '/maturity/' },
            { text: 'How it works', link: '/maturity/how-it-works' },
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
