import * as assert from 'assert';
import * as fs from 'fs';
import * as path from 'path';
import * as vscodeMock from '../mocks/vscode';

const { acquireModel, reportRefusal, ENABLE_SETTING } = require('../../ai/model');
const { aiCommands, filterByExpectation } = require('../../ai/commands');
const { getAiEnabled, getAiMaxAttempts, DEFAULT_AI_MAX_ATTEMPTS } = require('../../settings');

const SRC_DIR = path.join(__dirname, '..', '..', '..', 'src');

setup(() => vscodeMock.resetAll());

suite('[S20-SR-01] AI assistance is off by default', () => {
  test('the setting defaults to false', () => {
    assert.strictEqual(getAiEnabled(), false);
  });

  test('acquireModel refuses before touching any API when disabled', async () => {
    const access = await acquireModel();
    assert.strictEqual(access.ok, false);
    assert.strictEqual(access.reason, 'disabled');
    assert.strictEqual(
      vscodeMock.lm.selectChatModels.callCount, 0,
      'the default configuration must not be able to reach a model request',
    );
  });

  test('the manifest ships the setting defaulting to false', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(SRC_DIR, '..', 'package.json'), 'utf-8'));
    const setting = pkg.contributes.configuration.properties[ENABLE_SETTING];
    assert.ok(setting, `${ENABLE_SETTING} is not contributed`);
    assert.strictEqual(setting.default, false);
    assert.match(setting.markdownDescription, /Off by default/i);
  });

  test('the setting description states what is sent and that nothing is collected', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(SRC_DIR, '..', 'package.json'), 'utf-8'));
    const description = pkg.contributes.configuration.properties[ENABLE_SETTING].markdownDescription;
    assert.match(description, /Language Model API/);
    assert.match(description, /no API key/);
    assert.match(description, /no telemetry/i);
    assert.match(description, /verified/);
  });
});

suite('[F32-FR-02] acquireModel — availability', () => {
  setup(() => vscodeMock.setConfig('jsonschema.ai', 'enabled', true));

  test('reports unavailability when no model is configured', async () => {
    vscodeMock.lm.selectChatModels.resolves([]);
    const access = await acquireModel();
    assert.strictEqual(access.ok, false);
    assert.strictEqual(access.reason, 'unavailable');
    assert.match(access.message, /No language model is available/);
  });

  test('reports unavailability when selection throws', async () => {
    vscodeMock.lm.selectChatModels.rejects(new Error('consent declined'));
    const access = await acquireModel();
    assert.strictEqual(access.ok, false);
    assert.match(access.message, /consent declined/);
  });

  test('returns an ask() that concatenates the streamed response', async () => {
    vscodeMock.lm.selectChatModels.resolves([{
      sendRequest: async () => ({
        text: (async function* () { yield '{"a"'; yield ':1}'; })(),
      }),
    }]);
    const access = await acquireModel();
    assert.ok(access.ok);
    assert.strictEqual(await access.ask('prompt'), '{"a":1}');
  });
});

suite('[F32-FR-01] reportRefusal — the one-click opt-in', () => {
  test('offers to enable the setting, and writes it globally when accepted', async () => {
    vscodeMock.window.showInformationMessage.resolves('Enable AI assistance');
    await reportRefusal({ ok: false, reason: 'disabled', message: 'AI assistance is off.' });
    const update = vscodeMock.window.showInformationMessage.getCall(0);
    assert.ok(update, 'the user was offered the opt-in');
    assert.deepStrictEqual(update.args.slice(1), ['Enable AI assistance', 'What is sent?']);
  });

  test('opens the documentation when the user asks what is sent', async () => {
    vscodeMock.window.showInformationMessage.resolves('What is sent?');
    await reportRefusal({ ok: false, reason: 'disabled', message: 'off' });
    assert.ok(vscodeMock.env.openExternal.called);
  });

  test('an unavailable model is a plain warning, not an opt-in prompt', async () => {
    await reportRefusal({ ok: false, reason: 'unavailable', message: 'no model' });
    assert.ok(vscodeMock.window.showWarningMessage.calledWith('no model'));
    assert.strictEqual(vscodeMock.window.showInformationMessage.callCount, 0);
  });
});

suite('[S20-SR-02][F32-NFR-02][S20-SR-08] every AI command refuses before requesting while disabled', () => {
  test('each command stops at the gate and makes no model request', async () => {
    const commands = aiCommands() as Array<[string, (...args: never[]) => Promise<void>]>;
    assert.ok(commands.length >= 6, 'every AI feature is registered');

    for (const [id, handler] of commands) {
      vscodeMock.resetAll();
      vscodeMock.window.activeTextEditor = {
        document: {
          languageId: 'json',
          uri: { path: '/w/a.schema.json', fsPath: '/w/a.schema.json' },
          getText: () => '{"$schema":"https://json-schema.org/draft/2020-12/schema","properties":{}}',
        },
        selection: { active: new vscodeMock.Position(0, 0) },
      };
      await handler();
      assert.strictEqual(
        vscodeMock.lm.selectChatModels.callCount, 0,
        `${id} reached a model request with AI disabled`,
      );
    }
  });
});

suite('[F32-FR-04] getAiMaxAttempts — bounded retries', () => {
  test('defaults to three', () => {
    assert.strictEqual(getAiMaxAttempts(), DEFAULT_AI_MAX_ATTEMPTS);
  });

  test('clamps to the 1–5 range and truncates', () => {
    vscodeMock.setConfig('jsonschema.ai', 'maxAttempts', 0);
    assert.strictEqual(getAiMaxAttempts(), 1);
    vscodeMock.setConfig('jsonschema.ai', 'maxAttempts', 99);
    assert.strictEqual(getAiMaxAttempts(), 5);
    vscodeMock.setConfig('jsonschema.ai', 'maxAttempts', 2.9);
    assert.strictEqual(getAiMaxAttempts(), 2);
  });

  test('ignores a non-numeric value', () => {
    vscodeMock.setConfig('jsonschema.ai', 'maxAttempts', 'lots');
    assert.strictEqual(getAiMaxAttempts(), DEFAULT_AI_MAX_ATTEMPTS);
  });
});

suite('[F32-FR-11] filterByExpectation — the Ajv gate on generated data', () => {
  const schema = { type: 'object', required: ['name'], properties: { name: { type: 'string' } } };

  test('keeps only valid instances in realistic mode', () => {
    const kept = filterByExpectation([{ name: 'Ada' }, {}, { name: 7 }], schema, false);
    assert.deepStrictEqual(kept, [{ name: 'Ada' }]);
  });

  test('keeps only invalid instances in adversarial mode', () => {
    const kept = filterByExpectation([{ name: 'Ada' }, {}, { name: 7 }], schema, true);
    assert.deepStrictEqual(kept, [{}, { name: 7 }]);
  });

  test('keeps nothing when the schema cannot be compiled', () => {
    assert.deepStrictEqual(filterByExpectation([{ a: 1 }], { type: 'not-a-type' }, false), []);
  });

  test('ignores a declared $schema draft URI it cannot fetch', () => {
    const withMeta = { $schema: 'https://json-schema.org/draft/2020-12/schema', ...schema };
    assert.deepStrictEqual(filterByExpectation([{ name: 'Ada' }], withMeta, false), [{ name: 'Ada' }]);
  });
});

suite('[S20-SR-06][F32-NFR-01][S20-SR-10] no vendor SDK, model id, or provider endpoint ships', () => {
  const sourceFiles = (dir: string): string[] =>
    fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) { return entry.name === 'test' ? [] : sourceFiles(full); }
      return entry.isFile() && full.endsWith('.ts') ? [full] : [];
    });

  test('no source file names a model provider SDK or endpoint', () => {
    // Model access goes through the editor's Language Model API and nothing
    // else, so swapping the user's provider changes nothing in this repo.
    const forbidden = [
      /@anthropic-ai\//, /\bfrom ['"]openai['"]/, /@google\/generative-ai/,
      /api\.openai\.com/, /api\.anthropic\.com/, /generativelanguage\.googleapis/,
      /\bgpt-[0-9]/i, /\bclaude-[0-9]/i, /\bgemini-[0-9]/i,
      /OPENAI_API_KEY/, /ANTHROPIC_API_KEY/,
    ];
    for (const file of sourceFiles(SRC_DIR)) {
      const text = fs.readFileSync(file, 'utf-8');
      for (const pattern of forbidden) {
        assert.doesNotMatch(text, pattern, `${path.relative(SRC_DIR, file)} matches ${pattern}`);
      }
    }
  });

  test('model access is confined to a single module', () => {
    const users = sourceFiles(SRC_DIR).filter(file =>
      /\bvscode\.lm\b|selectChatModels/.test(fs.readFileSync(file, 'utf-8')),
    );
    assert.deepStrictEqual(
      users.map(f => path.relative(SRC_DIR, f)).sort(),
      ['LanguageModelTools.ts', 'ai/model.ts'],
      'only the model wrapper and the tool registration may touch vscode.lm',
    );
  });

  test('no dependency is a model provider SDK', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(SRC_DIR, '..', 'package.json'), 'utf-8'));
    const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    for (const name of names) {
      assert.doesNotMatch(name, /^(openai|@anthropic-ai\/|@google\/generative-ai|cohere|mistralai)/, name);
    }
  });
});
