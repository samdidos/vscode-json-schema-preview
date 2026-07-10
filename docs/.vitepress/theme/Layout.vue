<script setup lang="ts">
import DefaultTheme from 'vitepress/theme'
import { useRoute } from 'vitepress'
import { onMounted, onUnmounted, nextTick, watch } from 'vue'
import ReleaseBadge from './ReleaseBadge.vue'
import QuickDemo from './QuickDemo.vue'

const { Layout } = DefaultTheme
const route = useRoute()

let observer: IntersectionObserver | undefined

// Elements that slide in as they enter the viewport: the built-in feature
// cards and our custom demo section.
const REVEAL_SELECTOR = '.VPFeature, .demo-section'

function setupReveal(): void {
  if (typeof window === 'undefined') { return }
  // Respect the user's motion preference — never hide content from them.
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return }

  if (!observer) {
    observer = new IntersectionObserver(
      entries => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('reveal-in')
            observer!.unobserve(entry.target)
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    )
  }

  // Cascade the feature cards so they slide in one after another.
  document.querySelectorAll<HTMLElement>('.VPFeatures .VPFeature').forEach((el, i) => {
    el.style.transitionDelay = `${Math.min(i, 6) * 70}ms`
  })

  document.querySelectorAll<HTMLElement>(REVEAL_SELECTOR).forEach(el => {
    if (!el.classList.contains('reveal-init')) {
      el.classList.add('reveal-init')
      observer!.observe(el)
    }
  })
}

// Run after the home sections have rendered, and again after client-side
// navigation (the home page's DOM is replaced on route change).
onMounted(() => nextTick(setupReveal))
watch(() => route.path, () => nextTick(() => setTimeout(setupReveal, 60)))
onUnmounted(() => {
  observer?.disconnect()
  observer = undefined
})
</script>

<template>
  <Layout>
    <template #home-hero-after><ReleaseBadge /></template>
    <template #home-features-after><QuickDemo /></template>
  </Layout>
</template>
