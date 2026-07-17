import DefaultTheme from 'vitepress/theme'
import './style.css'
import Layout from './Layout.vue'
import SpecMatrix from './SpecMatrix.vue'
import SpecSourceLink from './SpecSourceLink.vue'
import SpecStatusTable from './SpecStatusTable.vue'
import SpecTraceability from './SpecTraceability.vue'
import type { Theme } from 'vitepress'

export default {
  extends: DefaultTheme,
  Layout,
  // Registered globally because the generated spec pages (docs/specs/[id].md)
  // share one markdown template and can't carry per-page <script setup>.
  enhanceApp({ app }) {
    app.component('SpecMatrix', SpecMatrix)
    app.component('SpecSourceLink', SpecSourceLink)
    app.component('SpecStatusTable', SpecStatusTable)
    app.component('SpecTraceability', SpecTraceability)
  },
} satisfies Theme
