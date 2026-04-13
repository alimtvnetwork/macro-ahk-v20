/**
 * Macro Controller — API & Data Record Type Definitions
 *
 * Semantic type aliases that replace `Record<string, unknown>` across the codebase.
 * Each alias carries domain intent and narrows the value type.
 */

/** Primitive value types found in API responses and DB rows. */
export type FieldValue = string | number | boolean | null;

/**
 * A single row from a database table.
 * All field values are primitives (no nested objects).
 */
export type DatabaseRow = Record<string, FieldValue>;

/**
 * Raw workspace item from the /user/workspaces credit API.
 * Contains flat numeric/string fields + optional nested `workspace` sub-object.
 */
export interface RawWorkspaceApiItem {
  id?: string;
  name?: string;
  workspace?: Record<string, string | number>;
  billing_period_credits_used?: number;
  billing_period_credits_limit?: number;
  daily_credits_used?: number;
  daily_credits_limit?: number;
  rollover_credits_used?: number;
  rollover_credits_limit?: number;
  credits_granted?: number;
  credits_used?: number;
  topup_credits_limit?: number;
  total_credits_used?: number;
  subscription_status?: string;
  role?: string;
  plan?: string;
  [key: string]: string | number | boolean | Record<string, string | number> | undefined;
}

/**
 * Top-level response shape from the credit/workspaces API.
 */
export interface WorkspacesApiResponse {
  workspaces?: RawWorkspaceApiItem[];
  [key: string]: RawWorkspaceApiItem[] | string | number | boolean | undefined;
}

/**
 * Generic mutation payload sent to APIs (rename, update, etc.).
 * Values are primitives only.
 */
export type MutationPayload = Record<string, FieldValue | undefined>;

/**
 * Schema validation rules — maps field names to constraint values.
 */
export type ValidationRules = Record<string, string | number | boolean>;

/**
 * Generic API response data with known primitive fields.
 * For responses that may contain nested objects, use more specific types.
 */
export type ApiResponseData = Record<string, FieldValue | FieldValue[] | Record<string, FieldValue>>;

/**
 * Auto-attach configuration from JSON config.
 */
export type AutoAttachRawConfig = Record<string, string | number | boolean | Array<Record<string, string | string[]>>>;

/**
 * Column definition payload for schema operations.
 */
export interface ColumnDefinition {
  name: string;
  type: string;
  primaryKey?: boolean;
  notNull?: boolean;
  defaultValue?: string | number | boolean | null;
  unique?: boolean;
  validation?: ValidationRules;
}

/* ================================================================== */
/*  Template Rendering                                                 */
/* ================================================================== */

/**
 * Data context passed to the template renderer.
 * Values can be primitives, arrays (for {{#each}}), or nested objects.
 */
export type TemplateData = Record<string, FieldValue | undefined | FieldValue[] | TemplateDataItem[] | TemplateData>;

/** A single item in a template {{#each}} array. */
export type TemplateDataItem = Record<string, FieldValue>;

/* ================================================================== */
/*  Extension Messaging Payload                                        */
/* ================================================================== */

/**
 * Payload sent to the extension via sendToExtension().
 * Keys are message-specific; values are always primitives.
 */
export type ExtensionPayload = Record<string, FieldValue | undefined>;

/* ================================================================== */
/*  Prompt Form Data (modal initial values)                            */
/* ================================================================== */

/**
 * Initial data for the prompt creation/edit modal form.
 */
export interface PromptFormData {
  name?: string;
  text?: string;
  category?: string;
  id?: string;
  isDefault?: boolean;
}

/* ================================================================== */
/*  IDB Record                                                         */
/* ================================================================== */

/**
 * A generic IndexedDB record with a string key and primitive values.
 */
export type IdbRecord = Record<string, FieldValue | undefined>;

/* ================================================================== */
/*  Window Global Accessors                                            */
/* ================================================================== */

/**
 * Typed accessor for `window.marco_config_overrides`.
 * Used by auth-recovery to read optional TTL overrides.
 */
export interface MarcoConfigOverrides {
  tokenTtlMs?: number;
}

/**
 * Typed augmentation for startup state with internal timeout tracking.
 */
export interface StartupStateWithTimeout {
  __uiTimeoutId?: number;
}

/* ================================================================== */
/*  Namespace Traversal                                                */
/* ================================================================== */

/** Shape of Projects.MacroController sub-namespace during bootstrapping. */
export interface MacroControllerNamespaceShape {
  meta?: Record<string, string | number | boolean>;
  api?: MacroControllerApiShape;
  _internal?: Record<string, string | number | boolean | object>;
  cookies?: { bindings?: Array<{ role?: string; cookieName?: string }> };
  [key: string]: string | number | boolean | object | undefined;
}

/** Shape of the api sub-namespace under MacroController. */
export interface MacroControllerApiShape {
  loop?: Record<string, string | number | boolean | object>;
  config?: Record<string, string | number | boolean | object>;
  autoAttach?: Record<string, string | number | boolean | object>;
  ui?: Record<string, string | number | boolean | object>;
  [key: string]: string | number | boolean | object | undefined;
}

/* ================================================================== */
/*  Workspace Probe Response                                           */
/* ================================================================== */

/**
 * Data from a workspace session probe API response.
 */
export interface WorkspaceProbeData {
  workspaces?: Array<Record<string, FieldValue>>;
  [key: string]: FieldValue | Array<Record<string, FieldValue>> | undefined;
}
  name: string;
  type: string;
  primaryKey?: boolean;
  notNull?: boolean;
  defaultValue?: string | number | boolean | null;
  unique?: boolean;
  validation?: ValidationRules;
}
