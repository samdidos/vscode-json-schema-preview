import { defineConfig } from 'vitepress'

export default defineConfig({
  title: 'JSON Schema Preview',
  description: 'Preview, validate and edit JSON Schema documents directly in VS Code.',
  base: '/vscode-json-schema-preview/',

  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/vscode-json-schema-preview/logo.svg' }],
  ],

  themeConfig: {
    logo: '/logo.svg',
    siteTitle: 'JSON Schema Preview',

    nav: [
      { text: 'Guide', link: '/guide/' },
      { text: 'Commands', link: '/guide/commands' },
      { text: 'Configuration', link: '/guide/configuration' },
      {
        text: 'GitHub',
        link: 'https://github.com/samdidos/vscode-json-schema-preview',
        target: '_blank',
      },
    ],

    sidebar: [
      {
        text: 'Getting Started',
        items: [
          { text: 'Introduction', link: '/guide/' },
          { text: 'Commands', link: '/guide/commands' },
          { text: 'Configuration', link: '/guide/configuration' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/samdidos/vscode-json-schema-preview' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright © 2024-present Samuel Cardinal',
    },

    search: { provider: 'local' },
  },
})
