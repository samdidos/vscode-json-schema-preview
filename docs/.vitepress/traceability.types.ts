// AUTO-GENERATED — DO NOT EDIT.
// Generated from specs/traceability.schema.json by the project's own F18
// code generator (src/typeGenerator.ts) via `npm run codegen:traceability`.
// Edit the schema and regenerate; never hand-edit this file (S11-SR-03/04).

/**
 * Requirement traceability matrix for the JSON Schema Preview extension. Maps every
 * requirement ID (defined in the specs directory) to its implementation status and the
 * source files realising it.
 */
export interface TraceabilityMatrix {
  /**
   * Human note about the file's purpose; ignored by tooling.
   */
  $comment?: string;
  /**
   * Inline binding to this schema (F10 convention).
   */
  $schema?: string;
  /**
   * Map of requirement ID (e.g. F10-FR-04) to its traceability entry.
   */
  requirements: { [key: string]: Requirement };
  /**
   * Map of status name to its human-readable meaning.
   */
  statuses: { [key: string]: string };
}

export interface Requirement {
  /**
   * Source files implementing this requirement (repo-relative paths).
   */
  impl?: string[];
  /**
   * Free-text clarification for this entry.
   */
  note?: string;
  /**
   * Implementation status of the requirement.
   */
  status: Status;
}

/**
 * Implementation status of the requirement.
 */
export type Status = "untracked" | "planned" | "implemented" | "manual" | "deferred";

