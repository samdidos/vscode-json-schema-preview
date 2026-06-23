import * as vscode from 'vscode';

type CredentialType = 'bearer' | 'basic';

interface StoredCredential {
  type: CredentialType;
  value: string; // bearer: raw token; basic: base64("user:pass")
}

export class AuthRequiredError extends Error {
  constructor(public readonly url: string, public readonly status: number) {
    super(`HTTP ${status} — authentication required for ${SchemaAuthManager.hostOf(url)}`);
    this.name = 'AuthRequiredError';
  }
}

export class SchemaAuthManager {
  private static readonly SECRET_PREFIX = 'schemaauth:';

  constructor(private readonly context: vscode.ExtensionContext) {}

  // ── Static URL utilities ──────────────────────────────────────────────────

  static isRemoteUrl(url: string): boolean {
    return url.startsWith('http://') || url.startsWith('https://');
  }

  static isGitHubUrl(url: string): boolean {
    try {
      const { hostname } = new URL(url);
      return hostname === 'raw.githubusercontent.com'
        || hostname === 'api.github.com'
        || hostname.endsWith('.github.com')
        || hostname.endsWith('.githubusercontent.com');
    } catch {
      return false;
    }
  }

  static hostOf(url: string): string {
    try { return new URL(url).hostname; } catch { return url; }
  }

  // ── Auth header resolution ────────────────────────────────────────────────

  async getAuthHeaders(url: string): Promise<Record<string, string>> {
    if (SchemaAuthManager.isGitHubUrl(url)) {
      const token = await this.getGitHubToken();
      if (token) return { Authorization: `Bearer ${token}` };
    }
    const cred = await this.getStoredCredential(SchemaAuthManager.hostOf(url));
    if (!cred) return {};
    return cred.type === 'bearer'
      ? { Authorization: `Bearer ${cred.value}` }
      : { Authorization: `Basic ${cred.value}` };
  }

  // ── Fetch ─────────────────────────────────────────────────────────────────

  async fetchText(url: string, timeoutMs = 30_000): Promise<string> {
    const headers = await this.getAuthHeaders(url);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetch(url, { headers, signal: controller.signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') {
        throw new Error(`Timed out fetching ${url} after ${timeoutMs} ms`);
      }
      throw e;
    } finally {
      clearTimeout(timer);
    }
    if (res.status === 401 || res.status === 403) throw new AuthRequiredError(url, res.status);
    if (!res.ok) throw new Error(`HTTP ${res.status} fetching ${url}`);
    return res.text();
  }

  // ── Credential state ──────────────────────────────────────────────────────

  async isConfigured(url: string): Promise<boolean> {
    if (SchemaAuthManager.isGitHubUrl(url)) return this.hasGitHubSession();
    return (await this.getStoredCredential(SchemaAuthManager.hostOf(url))) !== undefined;
  }

  // ── Interactive configuration UI ──────────────────────────────────────────

  async configureAuth(url: string): Promise<boolean> {
    const host = SchemaAuthManager.hostOf(url);
    const isGitHub = SchemaAuthManager.isGitHubUrl(url);
    const configured = await this.isConfigured(url);

    type AuthItem = vscode.QuickPickItem & { id: 'github' | 'bearer' | 'basic' | 'remove' };

    const items: AuthItem[] = [];

    if (isGitHub) {
      items.push({
        label: '$(github) Sign in with GitHub',
        description: 'Use your existing VS Code GitHub account',
        id: 'github',
      });
    }

    items.push(
      { label: '$(key) Bearer token', description: 'API key or personal access token', id: 'bearer' },
      { label: '$(person) Basic auth', description: 'Username and password', id: 'basic' },
    );

    if (configured) {
      items.push({
        label: '$(trash) Remove credentials',
        description: `Clear saved auth for ${host}`,
        id: 'remove',
      });
    }

    const pick = await vscode.window.showQuickPick(items, {
      title: `Configure authentication for ${host}`,
      placeHolder: 'Select authentication method',
    });
    if (!pick) return false;

    switch (pick.id) {
      case 'github': {
        await vscode.authentication.getSession('github', ['repo'], { createIfNone: true });
        vscode.window.showInformationMessage(`GitHub authentication configured for ${host}.`);
        return true;
      }

      case 'bearer': {
        const token = await vscode.window.showInputBox({
          title: `Bearer token for ${host}`,
          prompt: 'Enter your API key or personal access token',
          password: true,
          ignoreFocusOut: true,
        });
        if (!token) return false;
        await this.storeCredential(host, { type: 'bearer', value: token });
        vscode.window.showInformationMessage(`Bearer token saved for ${host}.`);
        return true;
      }

      case 'basic': {
        const username = await vscode.window.showInputBox({
          title: `Basic auth for ${host} (1/2)`,
          prompt: 'Username',
          ignoreFocusOut: true,
        });
        if (!username) return false;
        const password = await vscode.window.showInputBox({
          title: `Basic auth for ${host} (2/2)`,
          prompt: 'Password or access token',
          password: true,
          ignoreFocusOut: true,
        });
        if (!password) return false;
        const encoded = Buffer.from(`${username}:${password}`).toString('base64');
        await this.storeCredential(host, { type: 'basic', value: encoded });
        vscode.window.showInformationMessage(`Basic auth saved for ${host}.`);
        return true;
      }

      case 'remove': {
        await this.removeCredential(host);
        vscode.window.showInformationMessage(`Credentials removed for ${host}.`);
        return true;
      }
    }
    return false;
  }

  // ── Private helpers ───────────────────────────────────────────────────────

  private async getGitHubToken(): Promise<string | undefined> {
    try {
      const session = await vscode.authentication.getSession('github', ['repo'], { silent: true });
      return session?.accessToken;
    } catch {
      return undefined;
    }
  }

  private async hasGitHubSession(): Promise<boolean> {
    return (await this.getGitHubToken()) !== undefined;
  }

  private async getStoredCredential(host: string): Promise<StoredCredential | undefined> {
    const raw = await this.context.secrets.get(`${SchemaAuthManager.SECRET_PREFIX}${host}`);
    if (!raw) return undefined;
    try { return JSON.parse(raw) as StoredCredential; } catch { return undefined; }
  }

  private async storeCredential(host: string, cred: StoredCredential): Promise<void> {
    await this.context.secrets.store(
      `${SchemaAuthManager.SECRET_PREFIX}${host}`,
      JSON.stringify(cred),
    );
  }

  private async removeCredential(host: string): Promise<void> {
    await this.context.secrets.delete(`${SchemaAuthManager.SECRET_PREFIX}${host}`);
  }
}
