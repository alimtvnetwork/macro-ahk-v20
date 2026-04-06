/**
 * Marco Extension — Script Bundle Types
 *
 * A ScriptBundle is a named group containing multiple ordered JS files
 * and multiple ordered JSON configs. Configs load first (in order),
 * then JS files execute (in order).
 */

/** A single JS file entry within a bundle. */
export interface BundleJsEntry {
  id: string;
  name: string;
  code: string;
  order: number;
  runAt?: "document_start" | "document_idle" | "document_end";
}

/** A single JSON config entry within a bundle. */
export interface BundleConfigEntry {
  id: string;
  name: string;
  json: string;
  order: number;
}

/** A script bundle — the primary entity in the Scripts section. */
export interface ScriptBundle {
  id: string;
  name: string;
  description?: string;
  jsEntries: BundleJsEntry[];
  configEntries: BundleConfigEntry[];
  order: number;
  isEnabled?: boolean;
  createdAt: string;
  updatedAt: string;
}
