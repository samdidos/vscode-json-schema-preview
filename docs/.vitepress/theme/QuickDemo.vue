<template>
  <section class="demo-section">
    <div class="demo-label">Quick Start</div>
    <p class="demo-subtitle">
      Open any JSON or YAML Schema file and use the editor toolbar or Command Palette.
    </p>

    <div class="demo-frame">
      <!-- Editor pane -->
      <div class="pane editor-pane">
        <div class="pane-bar">
          <span class="dot red" /><span class="dot yellow" /><span class="dot green" />
          <span class="pane-title">schema.json</span>
        </div>
        <pre class="code"><span class="tok-p">{</span>
  <span class="tok-k">"$schema"</span><span class="tok-p">:</span> <span class="tok-s">"https://json-schema.org/draft/2020-12/schema"</span><span class="tok-p">,</span>
  <span class="tok-k">"title"</span><span class="tok-p">:</span>   <span class="tok-s">"User"</span><span class="tok-p">,</span>
  <span class="tok-k">"type"</span><span class="tok-p">:</span>    <span class="tok-s">"object"</span><span class="tok-p">,</span>
  <span class="tok-k">"required"</span><span class="tok-p">:</span> <span class="tok-p">[</span><span class="tok-s">"name"</span><span class="tok-p">,</span> <span class="tok-s">"email"</span><span class="tok-p">],</span>
  <span class="tok-k">"properties"</span><span class="tok-p">:</span> <span class="tok-p">{</span>
    <span class="tok-k">"name"</span><span class="tok-p">:</span>  <span class="tok-p">{</span> <span class="tok-k">"type"</span><span class="tok-p">:</span> <span class="tok-s">"string"</span> <span class="tok-p">},</span>
    <span class="tok-k">"email"</span><span class="tok-p">:</span> <span class="tok-p">{</span> <span class="tok-k">"type"</span><span class="tok-p">:</span> <span class="tok-s">"string"</span><span class="tok-p">,</span>
               <span class="tok-k">"format"</span><span class="tok-p">:</span> <span class="tok-s">"email"</span> <span class="tok-p">},</span>
    <span class="tok-k">"age"</span><span class="tok-p">:</span>   <span class="tok-p">{</span> <span class="tok-k">"type"</span><span class="tok-p">:</span> <span class="tok-s">"integer"</span><span class="tok-p">,</span>
               <span class="tok-k">"minimum"</span><span class="tok-p">:</span> <span class="tok-n">0</span> <span class="tok-p">}</span>
  <span class="tok-p">}</span>
<span class="tok-p">}</span></pre>
      </div>

      <!-- Arrow -->
      <div class="arrow-col">
        <div class="cmd-bubble">JSON Schema: Preview</div>
        <div class="arrow">→</div>
      </div>

      <!-- Preview pane -->
      <div class="pane preview-pane">
        <div class="pane-bar">
          <span class="dot red" /><span class="dot yellow" /><span class="dot green" />
          <span class="pane-title">Preview — schema.json</span>
        </div>
        <div class="preview-content">
          <div class="pr-title">User</div>
          <div class="pr-type">object</div>
          <div class="pr-section">Required: <span class="tag">name</span><span class="tag">email</span></div>
          <div class="pr-prop"><span class="prop-name">name</span><span class="prop-type">string</span></div>
          <div class="pr-prop"><span class="prop-name">email</span><span class="prop-type">string · email</span></div>
          <div class="pr-prop"><span class="prop-name">age</span><span class="prop-type">integer ≥ 0</span></div>
        </div>
      </div>
    </div>

    <p class="demo-hint">
      💡 Replace this animation with a screen-recording GIF at
      <code>docs/public/demo.gif</code> and swap in
      <code>&lt;img src="/vscode-json-schema-preview/demo.gif" /&gt;</code>
    </p>
  </section>
</template>

<style scoped>
.demo-section {
  max-width: 860px;
  margin: 0 auto 64px;
  padding: 0 24px;
  text-align: center;
}

.demo-label {
  font-size: 13px;
  font-weight: 700;
  letter-spacing: .1em;
  text-transform: uppercase;
  color: var(--vp-c-brand-1);
  margin-bottom: 8px;
}

.demo-subtitle {
  font-size: 15px;
  color: var(--vp-c-text-2);
  margin: 0 0 28px;
}

/* ── Frame ─────────────────────────────── */
.demo-frame {
  display: flex;
  align-items: center;
  gap: 12px;
  background: var(--vp-c-bg-soft);
  border: 1px solid var(--vp-c-border);
  border-radius: 12px;
  padding: 20px;
  overflow: hidden;
}

/* ── Editor / preview panes ────────────── */
.pane {
  flex: 1;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid var(--vp-c-border);
  background: var(--vp-c-bg);
  min-width: 0;
}

.pane-bar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 8px 12px;
  background: var(--vp-c-bg-soft);
  border-bottom: 1px solid var(--vp-c-border);
}

.dot {
  width: 10px; height: 10px;
  border-radius: 50%;
  flex-shrink: 0;
}
.red    { background: #ff5f57; }
.yellow { background: #ffbd2e; }
.green  { background: #28c840; }

.pane-title {
  margin-left: 8px;
  font-size: 11px;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
}

/* ── Code block ─────────────────────────── */
.code {
  margin: 0;
  padding: 14px;
  font-size: 10.5px;
  line-height: 1.6;
  font-family: var(--vp-font-family-mono);
  overflow-x: auto;
  text-align: left;
  color: var(--vp-c-text-1);
}

.tok-k { color: #7dd3fc; }   /* key   – sky blue   */
.tok-s { color: #86efac; }   /* string – green     */
.tok-n { color: #fda4af; }   /* number – pink      */
.tok-p { color: var(--vp-c-text-2); } /* punctuation */

/* ── Arrow / command bubble ─────────────── */
.arrow-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  flex-shrink: 0;
  animation: pulse 3s ease-in-out infinite;
}

.cmd-bubble {
  background: var(--vp-c-brand-soft);
  border: 1px solid var(--vp-c-brand-1);
  color: var(--vp-c-brand-1);
  border-radius: 6px;
  padding: 4px 8px;
  font-size: 9.5px;
  font-family: var(--vp-font-family-mono);
  white-space: nowrap;
}

.arrow {
  font-size: 24px;
  color: var(--vp-c-brand-1);
}

@keyframes pulse {
  0%, 100% { opacity: 1; transform: translateX(0); }
  50%       { opacity: .7; transform: translateX(3px); }
}

/* ── Preview content ────────────────────── */
.preview-content {
  padding: 14px;
  text-align: left;
  animation: fadeIn 1.2s ease-out both;
  animation-delay: .4s;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(6px); }
  to   { opacity: 1; transform: translateY(0); }
}

.pr-title {
  font-size: 15px;
  font-weight: 700;
  color: var(--vp-c-text-1);
  margin-bottom: 2px;
}

.pr-type {
  font-size: 11px;
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-brand-1);
  margin-bottom: 10px;
}

.pr-section {
  font-size: 11px;
  color: var(--vp-c-text-2);
  margin-bottom: 10px;
}

.tag {
  display: inline-block;
  background: var(--vp-c-brand-soft);
  color: var(--vp-c-brand-1);
  border-radius: 4px;
  padding: 1px 6px;
  font-family: var(--vp-font-family-mono);
  font-size: 10px;
  margin: 0 3px 3px 0;
}

.pr-prop {
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 11px;
  padding: 5px 0;
  border-bottom: 1px solid var(--vp-c-divider);
}

.prop-name {
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-1);
  font-weight: 600;
}

.prop-type {
  font-family: var(--vp-font-family-mono);
  color: var(--vp-c-text-2);
  font-size: 10px;
}

.demo-hint {
  margin-top: 16px;
  font-size: 12px;
  color: var(--vp-c-text-3);
}

/* ── Responsive ────────────────────────── */
@media (max-width: 660px) {
  .demo-frame { flex-direction: column; }
  .arrow-col  { flex-direction: row; }
  .arrow      { transform: rotate(90deg); }
}
</style>
