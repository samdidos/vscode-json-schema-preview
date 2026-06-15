import { h } from 'vue'
import DefaultTheme from 'vitepress/theme'
import './style.css'
import QuickDemo from './QuickDemo.vue'
import ReleaseBadge from './ReleaseBadge.vue'

export default {
  extends: DefaultTheme,
  Layout() {
    return h(DefaultTheme.Layout, null, {
      'home-hero-after': () => h(ReleaseBadge),
      'home-features-after': () => h(QuickDemo),
    })
  },
}
