export default {
  async load(): Promise<{ version: string | null; url: string | null }> {
    try {
      const res = await fetch(
        'https://api.github.com/repos/samdidos/vscode-json-schema-preview/releases/latest',
        { headers: { Accept: 'application/vnd.github+json' } }
      )
      if (!res.ok) return { version: null, url: null }
      const data = await res.json() as { tag_name: string; html_url: string }
      return { version: data.tag_name, url: data.html_url }
    } catch {
      return { version: null, url: null }
    }
  },
}
