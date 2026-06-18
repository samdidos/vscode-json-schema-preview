<template>
  <section class="demo-section">
    <div class="demo-label">Feature Demos</div>
    <p class="demo-subtitle">
      Click any card to expand. All demos run directly in VS Code — no browser required.
    </p>

    <div class="demo-grid">
      <div v-for="f in features" :key="f.id" class="demo-card" @click="active = active === f.id ? null : f.id">
        <div class="card-header">
          <span class="card-icon">{{ f.icon }}</span>
          <span class="card-title">{{ f.title }}</span>
          <span class="card-chevron" :class="{ open: active === f.id }">›</span>
        </div>
        <p class="card-desc">{{ f.desc }}</p>
        <Transition name="expand">
          <div v-if="active === f.id" class="card-gif">
            <img :src="base + f.gif" :alt="f.title + ' demo'" loading="lazy" />
          </div>
        </Transition>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { ref } from 'vue'

const base = '/vscode-json-schema-preview/'
const active = ref<string | null>('preview')

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
</script>

<style scoped>
.demo-section {
  max-width: 860px;
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
  margin-bottom: 8px;
}

.demo-subtitle {
  text-align: center;
  font-size: 15px;
  color: var(--vp-c-text-2);
  margin: 0 0 32px;
}

/* ── Grid ─────────────────────────────────── */
.demo-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
  gap: 16px;
}

/* ── Card ─────────────────────────────────── */
.demo-card {
  border: 1px solid var(--vp-c-border);
  border-radius: 10px;
  background: var(--vp-c-bg-soft);
  overflow: hidden;
  cursor: pointer;
  transition: border-color .2s, box-shadow .2s;
}

.demo-card:hover {
  border-color: var(--vp-c-brand-1);
  box-shadow: 0 0 0 2px var(--vp-c-brand-soft);
}

.card-header {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 16px 0;
}

.card-icon   { font-size: 18px; flex-shrink: 0; }
.card-title  { font-size: 14px; font-weight: 700; color: var(--vp-c-text-1); flex: 1; }
.card-chevron {
  font-size: 18px;
  color: var(--vp-c-text-3);
  transform: rotate(0deg);
  transition: transform .25s;
  line-height: 1;
}
.card-chevron.open { transform: rotate(90deg); }

.card-desc {
  margin: 6px 16px 14px;
  font-size: 13px;
  color: var(--vp-c-text-2);
  line-height: 1.5;
}

/* ── GIF panel ────────────────────────────── */
.card-gif {
  border-top: 1px solid var(--vp-c-border);
  padding: 12px;
  background: #111;
}

.card-gif img {
  display: block;
  width: 100%;
  border-radius: 6px;
}

/* ── Transition ───────────────────────────── */
.expand-enter-active,
.expand-leave-active {
  transition: opacity .25s, max-height .3s ease;
  max-height: 400px;
  overflow: hidden;
}
.expand-enter-from,
.expand-leave-to {
  opacity: 0;
  max-height: 0;
}
</style>
