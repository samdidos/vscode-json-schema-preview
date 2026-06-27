<template>
  <section class="demo-section">
    <div class="demo-label">Feature Demos</div>

    <div class="demo-tabs" role="tablist">
      <button
        v-for="f in features"
        :key="f.id"
        class="demo-tab"
        :class="{ active: active === f.id }"
        role="tab"
        :aria-selected="active === f.id"
        @click="active = f.id"
      >
        <span class="tab-icon">{{ f.icon }}</span>
        <span class="tab-title">{{ f.title }}</span>
      </button>
    </div>

    <Transition name="fade" mode="out-in">
      <div :key="active" class="demo-display">
        <p class="demo-desc">{{ activeFeature.desc }}</p>
        <div class="demo-gif-wrap">
          <img
            :src="base + activeFeature.gif"
            :alt="activeFeature.title + ' demo'"
            loading="lazy"
          />
        </div>
      </div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const base = '/vscode-json-schema-preview/'

const features = [
  {
    id: 'preview',
    icon: '👁',
    title: 'Live Preview',
    gif: 'demo-preview.gif',
    desc: 'Click the eye icon in the editor toolbar (or run JSON Schema: Preview) to open a rendered documentation panel beside your schema.',
  },
  {
    id: 'live-update',
    icon: '⚡',
    title: 'Live Update',
    gif: 'demo-live-update.gif',
    desc: 'Enable jsonschema.preview.liveUpdate and the preview refreshes automatically as you type, debounced to avoid flicker.',
  },
  {
    id: 'validation',
    icon: '✅',
    title: 'Validation',
    gif: 'demo-validation.gif',
    desc: 'Run JSON Schema: Validate This File on any bound data file. Errors appear as red squiggles inline and in the Problems panel.',
  },
  {
    id: 'binding',
    icon: '🔗',
    title: 'Schema Binding',
    gif: 'demo-binding.gif',
    desc: 'Bind any JSON / YAML data file to a schema via the Command Palette. The bound schema is shown in the status bar.',
  },
  {
    id: 'inference',
    icon: '🪄',
    title: 'Schema Inference',
    gif: 'demo-inference.gif',
    desc: 'Run JSON Schema: Generate Schema from This File to infer a schema from existing data. Opens as a new tab ready to save.',
  },
  {
    id: 'visual-editor',
    icon: '✏️',
    title: 'Visual Editor',
    gif: 'demo-visual-editor.gif',
    desc: 'Click the pencil icon to open a form-based editor. Edit keywords without touching raw JSON — saves back to the file on click.',
  },
]

const active = ref(features[0].id)
const activeFeature = computed(() => features.find(f => f.id === active.value)!)
</script>

<style scoped>
.demo-section {
  max-width: 960px;
  margin: 0 auto 64px;
  padding: 0 24px;
}

.demo-label {
  text-align: center;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
  margin-bottom: 20px;
}

/* ── Tab row ──────────────────────────────── */
.demo-tabs {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 8px;
  margin-bottom: 24px;
}

.demo-tab {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border: 1px solid var(--vp-c-border);
  border-radius: 99px;
  background: var(--vp-c-bg-soft);
  cursor: pointer;
  font-size: 13px;
  font-weight: 600;
  color: var(--vp-c-text-2);
  transition: border-color .18s, color .18s, background .18s, box-shadow .18s;
  white-space: nowrap;
}

.demo-tab:hover {
  border-color: var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
}

.demo-tab.active {
  border-color: var(--vp-c-brand-1);
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 2px var(--vp-c-brand-soft);
}

.tab-icon  { font-size: 15px; }
.tab-title { font-size: 13px; }

/* ── Display area ─────────────────────────── */
.demo-display {
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  overflow: hidden;
  background: var(--vp-c-bg-soft);
}

.demo-gif-wrap {
  background: #0d1117;
  line-height: 0;
}

.demo-gif-wrap img {
  display: block;
  width: 100%;
  height: auto;
}

.demo-desc {
  margin: 0;
  padding: 14px 20px;
  font-size: 14px;
  color: var(--vp-c-text-2);
  line-height: 1.6;
  border-bottom: 1px solid var(--vp-c-border);
}

/* ── Transition ───────────────────────────── */
.fade-enter-active,
.fade-leave-active { transition: opacity .18s ease; }
.fade-enter-from,
.fade-leave-to      { opacity: 0; }
</style>
