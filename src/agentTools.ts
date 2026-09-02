// F33 — the agent tool surface, defined once (F33-FR-01) and consumed by both
// surfaces: the extension's `languageModelTools` contribution and the CLI's
// `jstk mcp` server.
//
// Every tool delegates to the CLI core (F33-FR-02) by building the argv its
// equivalent subcommand takes, so an agent and a human provably get the same
// answer from the same code — there is no second implementation of any schema
// logic here, only argument mapping.

export interface ToolDescriptor {
  /** Stable tool id, shared by both surfaces. */
  name: string;
  /** What the tool answers, written for a model to choose between tools. */
  description: string;
  /** JSON Schema for the tool's input. */
  inputSchema: Record<string, unknown>;
  /** Map validated input onto the CLI argv this tool delegates to. */
  toArgv(input: Record<string, unknown>): string[];
}

export interface ToolResult {
  text: string;
  /** True only for a *failure*; a finding (an invalid document, a breaking
   *  change) is an answer, not an error — see {@link isFailureCode}. */
  isError: boolean;
}

const str = (input: Record<string, unknown>, key: string): string | undefined => {
  const value = input[key];
  return typeof value === 'string' && value.trim() ? value : undefined;
};

const strList = (input: Record<string, unknown>, key: string): string[] => {
  const value = input[key];
  if (typeof value === 'string' && value.trim()) { return [value]; }
  if (!Array.isArray(value)) { return []; }
  return value.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
};

const flag = (input: Record<string, unknown>, key: string): boolean => input[key] === true;

const file = (description: string) => ({ type: 'string', description });

/** Thrown by a `toArgv` when required input is missing; surfaced as a tool error. */
export class ToolInputError extends Error {}

function required(value: string | undefined, name: string, tool: string): string {
  if (value === undefined) { throw new ToolInputError(`${tool}: "${name}" is required.`); }
  return value;
}

function requiredList(values: string[], name: string, tool: string): string[] {
  if (!values.length) { throw new ToolInputError(`${tool}: "${name}" must name at least one file.`); }
  return values;
}

/**
 * The tool set (F33-FR-03). Read-only by construction: every argv below is a
 * reporting subcommand, and none of them writes to disk (F33-NFR-03).
 */
export const AGENT_TOOLS: ToolDescriptor[] = [
  {
    name: 'jsonschema_validate',
    description:
      'Validate a JSON, YAML, JSONL or TOML data file against a JSON Schema and return the errors with their line numbers. Use this instead of judging validity by reading the documents.',
    inputSchema: {
      type: 'object',
      properties: {
        dataFile: file('Path to the data file to validate.'),
        schemaFile: file('Path to the JSON Schema to validate against.'),
      },
      required: ['dataFile', 'schemaFile'],
      additionalProperties: false,
    },
    toArgv: input => [
      'validate',
      required(str(input, 'dataFile'), 'dataFile', 'jsonschema_validate'),
      '--schema',
      required(str(input, 'schemaFile'), 'schemaFile', 'jsonschema_validate'),
      '--json',
    ],
  },
  {
    name: 'jsonschema_lint',
    description:
      'Report schema-quality findings for a JSON Schema file: unknown keywords, missing descriptions, duplicate enum values, examples and defaults that contradict their own subschema.',
    inputSchema: {
      type: 'object',
      properties: { schemaFile: file('Path to the JSON Schema to lint.') },
      required: ['schemaFile'],
      additionalProperties: false,
    },
    toArgv: input => [
      'lint',
      required(str(input, 'schemaFile'), 'schemaFile', 'jsonschema_lint'),
      '--json',
    ],
  },
  {
    name: 'jsonschema_diff',
    description:
      'Compare two versions of a JSON Schema and return a backward-compatibility verdict plus every classified change. Use this to decide whether a schema change is breaking — do not infer it from the diff text.',
    inputSchema: {
      type: 'object',
      properties: {
        oldSchemaFile: file('Path to the baseline (older) schema.'),
        newSchemaFile: file('Path to the proposed (newer) schema.'),
        strict: {
          type: 'boolean',
          description: 'Also treat changes the classifier cannot prove safe as blocking.',
        },
      },
      required: ['oldSchemaFile', 'newSchemaFile'],
      additionalProperties: false,
    },
    toArgv: input => [
      'diff',
      required(str(input, 'oldSchemaFile'), 'oldSchemaFile', 'jsonschema_diff'),
      required(str(input, 'newSchemaFile'), 'newSchemaFile', 'jsonschema_diff'),
      '--check',
      ...(flag(input, 'strict') ? ['--strict'] : []),
      '--json',
    ],
  },
  {
    name: 'jsonschema_bundle',
    description:
      'Flatten a multi-file schema into one self-contained document, either bundling external refs into $defs or dereferencing them inline.',
    inputSchema: {
      type: 'object',
      properties: {
        schemaFile: file('Path to the root schema.'),
        dereference: {
          type: 'boolean',
          description: 'Inline ref targets instead of collecting them into $defs.',
        },
      },
      required: ['schemaFile'],
      additionalProperties: false,
    },
    toArgv: input => [
      'bundle',
      required(str(input, 'schemaFile'), 'schemaFile', 'jsonschema_bundle'),
      ...(flag(input, 'dereference') ? ['--dereference'] : []),
    ],
  },
  {
    name: 'jsonschema_infer',
    description:
      'Infer a JSON Schema from an existing data file (JSON, JSONC, JSONL, YAML or TOML). Use this to bootstrap a schema from real documents.',
    inputSchema: {
      type: 'object',
      properties: {
        dataFile: file('Path to the data file to infer from.'),
        draft: {
          type: 'string',
          enum: ['2020-12', '2019-09', 'draft-07'],
          description: 'Target draft (default 2020-12).',
        },
      },
      required: ['dataFile'],
      additionalProperties: false,
    },
    toArgv: input => {
      const draft = str(input, 'draft');
      return [
        'infer',
        required(str(input, 'dataFile'), 'dataFile', 'jsonschema_infer'),
        ...(draft ? ['--to', draft] : []),
      ];
    },
  },
  {
    name: 'jsonschema_sample',
    description:
      'Generate a valid example instance from a JSON Schema. The output is validated against the schema before being returned.',
    inputSchema: {
      type: 'object',
      properties: { schemaFile: file('Path to the JSON Schema.') },
      required: ['schemaFile'],
      additionalProperties: false,
    },
    toArgv: input => ['sample', required(str(input, 'schemaFile'), 'schemaFile', 'jsonschema_sample')],
  },
  {
    name: 'jsonschema_coverage',
    description:
      'Report which properties a schema declares that the given data files never exercise — the unused-in-data surface of a contract.',
    inputSchema: {
      type: 'object',
      properties: {
        dataFiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'One or more data files to measure coverage from.',
        },
        schemaFile: file('Path to the JSON Schema.'),
      },
      required: ['dataFiles', 'schemaFile'],
      additionalProperties: false,
    },
    toArgv: input => [
      'coverage',
      ...requiredList(strList(input, 'dataFiles'), 'dataFiles', 'jsonschema_coverage'),
      '--schema',
      required(str(input, 'schemaFile'), 'schemaFile', 'jsonschema_coverage'),
      '--json',
    ],
  },
  {
    name: 'jsonschema_test',
    description:
      'Run declarative schema test suites (*.schema.test.json), which pin the documents a schema must accept and must reject. Use this to check a schema change against its contract.',
    inputSchema: {
      type: 'object',
      properties: {
        suiteFiles: {
          type: 'array',
          items: { type: 'string' },
          description: 'One or more *.schema.test.json suite files.',
        },
      },
      required: ['suiteFiles'],
      additionalProperties: false,
    },
    toArgv: input => [
      'test',
      ...requiredList(strList(input, 'suiteFiles'), 'suiteFiles', 'jsonschema_test'),
      '--json',
    ],
  },
];

export function findTool(name: string): ToolDescriptor | undefined {
  return AGENT_TOOLS.find(tool => tool.name === name);
}

/**
 * Whether a CLI exit code represents a *failure* rather than an answer
 * (F33-FR-12). `1` means the tool ran and found something — an invalid
 * document, a breaking change, a failing test — which is the answer the agent
 * asked for, not an error.
 */
export function isFailureCode(code: number): boolean {
  return code !== 0 && code !== 1;
}

/** Run one tool through an injected CLI runner (F33-FR-02/04/06). Never throws. */
export async function invokeAgentTool(
  name: string,
  input: Record<string, unknown>,
  run: (argv: string[]) => Promise<{ stdout: string; stderr: string; code: number }>,
): Promise<ToolResult> {
  const tool = findTool(name);
  if (!tool) {
    return { text: `Unknown tool "${name}".`, isError: true };
  }
  let argv: string[];
  try {
    argv = tool.toArgv(input ?? {});
  } catch (e) {
    return { text: (e as Error).message, isError: true };
  }
  try {
    const result = await run(argv);
    const text = result.stdout || result.stderr || '(no output)';
    return { text, isError: isFailureCode(result.code) };
  } catch (e) {
    return { text: `${name} failed: ${(e as Error).message}`, isError: true };
  }
}
