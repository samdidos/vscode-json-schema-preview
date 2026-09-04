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
            v-if="!failed.has(activeFeature.id)"
            :src="base + activeFeature.gif"
            :alt="activeFeature.title + ' demo'"
            loading="lazy"
            @error="failed.add(activeFeature.id)"
          />
          <!-- Graceful fallback: a demo whose GIF has not been regenerated yet
               (GIFs are rebuilt on each release) shows a placeholder rather
               than a broken image. -->
          <div v-else class="demo-gif-pending">
            <span class="demo-gif-pending-icon" aria-hidden="true">🎬</span>
            <p>This demo GIF is regenerated with each release — check back after the next one.</p>
          </div>
        </div>
      </div>
    </Transition>
  </section>
</template>

<script setup lang="ts">
import { ref, computed, reactive } from 'vue'

const base = '/vscode-json-schema-preview/'

// GIFs that failed to load (e.g. not yet regenerated for a new feature) — the
// display swaps to a placeholder instead of showing a broken image.
const failed = reactive(new Set<string>())

const features = [
  // The end-to-end run leads the gallery: it is the only demo that shows the
  // features working together rather than one at a time, and it is the same
  // recording the README opens with (S08-SR-20). Its GIF is much larger than
  // the rest, but the <img> only exists for the active tab, so it is fetched
  // when someone chooses it — not on page load.
  {
    id: 'showcase',
    icon: '🎬',
    title: 'Full walkthrough',
    gif: 'demo-showcase.gif',
    desc: 'One continuous run: infer a schema from a JSON file, preview it side by side, live-edit its title, configure how the docs render, and generate TypeScript types from it.',
  },
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
    id: 'codegen',
    icon: '🧬',
    title: 'Generate Types',
    gif: 'demo-codegen.gif',
    desc: 'Run JSON Schema: Generate Types from This Schema to turn a schema into typed code — TypeScript, Python, Go, Rust, Java, C#, and more. Pick the language and destination (new editor or a file you choose); enums become unions, descriptions become doc-comments.',
  },
  {
    id: 'visual-editor',
    icon: '✏️',
    title: 'Visual Editor',
    gif: 'demo-visual-editor.gif',
    desc: 'Click the pencil icon to open a form-based editor. Edit keywords without touching raw JSON — saves back to the file on click.',
  },
  {
    id: 'schema-auth',
    icon: '🔒',
    title: 'Private Schema Auth',
    gif: 'demo-schema-auth.gif',
    desc: 'Fetch schemas behind GitHub OAuth, Bearer tokens, or Basic auth via JSON Schema: Configure Schema Authentication — cached locally so the language server reads them too.',
  },
  {
    id: 'workspace-trust',
    icon: '🛡️',
    title: 'Workspace Trust',
    gif: 'demo-workspace-trust.gif',
    desc: 'In Restricted Mode the Python-based preview is disabled with a clear warning, while validation, binding, and inference keep working.',
  },
  {
    id: 'sample-data',
    icon: '🎲',
    title: 'Sample Data',
    gif: 'demo-sample-data.gif',
    desc: 'Run JSON Schema: Generate Sample Data from This Schema to produce a valid JSON or YAML instance straight from a schema — handy for fixtures and examples.',
  },
  {
    id: 'bundling',
    icon: '📦',
    title: 'Schema Bundling',
    gif: 'demo-bundling.gif',
    desc: 'Run JSON Schema: Bundle / Dereference Schema to flatten external $refs into $defs (round-trippable) or inline them entirely — one portable file, ready to publish.',
  },
  {
    id: 'ref-navigation',
    icon: '🧭',
    title: '$ref Navigation',
    gif: 'demo-ref-navigation.gif',
    desc: 'Ctrl-click (or Go to Definition) on any $ref to jump straight to the schema it points at — local, relative, or a cached remote schema.',
  },
  {
    id: 'quick-fix',
    icon: '💡',
    title: 'Quick Fixes',
    gif: 'demo-quick-fix.gif',
    desc: 'Validation errors carry a lightbulb when the repair is unambiguous — insert a missing required property, drop an unexpected one, or swap a value for the closest allowed enum member.',
  },
  {
    id: 'draft-migration',
    icon: '🔀',
    title: 'Draft Migration',
    gif: 'demo-draft-migration.gif',
    desc: 'Rewrite a schema between draft-07, 2019-09 and 2020-12, applying the well-known keyword changes and leaving anything it cannot safely convert untouched.',
  },
  {
    id: 'schema-linting',
    icon: '💡',
    title: 'Schema Linting',
    gif: 'demo-schema-linting.gif',
    desc: 'Schema-quality hints (missing $schema, $id, descriptions) show up as diagnostics with one-click quick fixes via the lightbulb.',
  },
  {
    id: 'outline',
    icon: '🧭',
    title: 'Schema Outline',
    gif: 'demo-outline.gif',
    desc: "The Outline view, breadcrumbs and Go-to-Symbol show the schema's shape — a property, its type, whether it is required — instead of a chain of \"properties\" nodes.",
  },
  {
    id: 'schema-tests',
    icon: '🧪',
    title: 'Schema Tests',
    gif: 'demo-schema-tests.gif',
    desc: 'Pin the documents a schema must accept and must reject in a *.schema.test.json file, then run the suite: a failing case lands on the case that broke.',
  },
  {
    id: 'workspace-validation',
    icon: '🗂️',
    title: 'Validate Workspace',
    gif: 'demo-workspace-validation.gif',
    desc: 'Run JSON Schema: Validate Workspace to check every bound file across every folder in one pass, with a Markdown report you can copy out.',
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
  padding: 20px 28px;
}

.demo-gif-wrap img {
  display: block;
  width: 100%;
  height: auto;
  border-radius: 6px;
}

.demo-gif-pending {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  min-height: 200px;
  padding: 40px 24px;
  text-align: center;
  color: #9aa7b4;
}

.demo-gif-pending-icon { font-size: 34px; }

.demo-gif-pending p {
  margin: 0;
  font-size: 13px;
  max-width: 360px;
  line-height: 1.5;
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
