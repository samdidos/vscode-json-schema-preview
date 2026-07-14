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

// Mouse/scroll parallax for the spark-field background (style.css reads
// these as --spark-mx/--spark-my/--spark-scroll). Listeners are window-level
// since the field itself is pointer-events:none, and are only attached on
// the home page (where .spark-field exists) with motion allowed.
let sparkFrame: number | undefined
let sparkListenersAttached = false
const pointer = { x: 0, y: 0 }

function flushSparkVars(): void {
  sparkFrame = undefined
  const root = document.documentElement.style
  root.setProperty('--spark-mx', pointer.x.toFixed(4))
  root.setProperty('--spark-my', pointer.y.toFixed(4))
  root.setProperty('--spark-scroll', `${window.scrollY}`)
}

function scheduleSparkUpdate(): void {
  if (sparkFrame !== undefined) { return }
  sparkFrame = requestAnimationFrame(flushSparkVars)
}

function onSparkPointerMove(e: PointerEvent): void {
  pointer.x = e.clientX / window.innerWidth - 0.5
  pointer.y = e.clientY / window.innerHeight - 0.5
  scheduleSparkUpdate()
}

function onSparkScroll(): void {
  scheduleSparkUpdate()
}

function setupSparkInteraction(): void {
  if (typeof window === 'undefined' || sparkListenersAttached) { return }
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) { return }
  if (!document.querySelector('.spark-field')) { return }
  sparkListenersAttached = true
  window.addEventListener('pointermove', onSparkPointerMove, { passive: true })
  window.addEventListener('scroll', onSparkScroll, { passive: true })
}

function teardownSparkInteraction(): void {
  if (!sparkListenersAttached) { return }
  sparkListenersAttached = false
  window.removeEventListener('pointermove', onSparkPointerMove)
  window.removeEventListener('scroll', onSparkScroll)
  if (sparkFrame !== undefined) {
    cancelAnimationFrame(sparkFrame)
    sparkFrame = undefined
  }
}

// Run after the home sections have rendered, and again after client-side
// navigation (the home page's DOM is replaced on route change).
onMounted(() => nextTick(() => { setupReveal(); setupSparkInteraction() }))
watch(() => route.path, () => nextTick(() => setTimeout(() => {
  setupReveal()
  teardownSparkInteraction()
  setupSparkInteraction()
}, 60)))
onUnmounted(() => {
  observer?.disconnect()
  observer = undefined
  teardownSparkInteraction()
})
</script>

<template>
  <Layout>
    <template #layout-top>
      <!-- Decorative drifting-sparks background, home page only (style.css). -->
      <!-- route.path includes the configured base, so compare the
           source-relative path instead (stable regardless of base). -->
      <div v-if="route.data.relativePath === 'index.md'" class="spark-field" aria-hidden="true">
        <div class="spark-layer spark-layer--1" />
        <div class="spark-layer spark-layer--2" />
        <div class="spark-layer spark-layer--3" />
      </div>
    </template>
    <template #home-hero-after><ReleaseBadge /></template>
    <template #home-features-after><QuickDemo /></template>
  </Layout>
</template>
