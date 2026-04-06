/**
 * Marco Extension — Project Exporter
 *
 * Builds a downloadable marco-project.json from project data
 * and triggers a browser file download.
 */

import type { StoredProject } from "@/hooks/use-projects-scripts";

interface ManifestScript {
  path: string;
  order: number;
  runAt: string;
  configBinding?: string;
}

interface ManifestUrlRule {
  pattern: string;
  matchType: string;
}

interface ProjectManifest {
  name: string;
  version: string;
  description?: string;
  targetUrls: ManifestUrlRule[];
  scripts: ManifestScript[];
  variables?: Record<string, unknown>;
}

/** Builds the manifest object from a stored project. */
function buildManifest(project: StoredProject): ProjectManifest {
  const manifest: ProjectManifest = {
    name: project.name,
    version: project.version,
    targetUrls: project.targetUrls ?? [],
    scripts: project.scripts.map(formatScript),
  };

  const hasDescription = Boolean(project.description);
  if (hasDescription) {
    manifest.description = project.description;
  }

  const variables = parseVariables(project);
  const hasVariables = variables !== null;
  if (hasVariables) {
    manifest.variables = variables;
  }

  return manifest;
}

/** Formats a script entry for export. */
function formatScript(s: { path: string; order: number; runAt?: string; configBinding?: string }): ManifestScript {
  const entry: ManifestScript = {
    path: s.path,
    order: s.order,
    runAt: s.runAt ?? "document_idle",
  };

  const hasConfig = Boolean(s.configBinding);
  if (hasConfig) {
    entry.configBinding = s.configBinding;
  }

  return entry;
}

/** Safely parses variables JSON from a project. */
function parseVariables(project: StoredProject): Record<string, unknown> | null {
  const raw = (project as unknown as Record<string, unknown>).variables as string | undefined;
  const isAbsent = !raw || raw === "{}";
  if (isAbsent) return null;

  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const isEmpty = Object.keys(parsed).length === 0;
    return isEmpty ? null : parsed;
  } catch {
    return null;
  }
}

/** Creates a slug from the project name. */
function buildFilename(name: string): string {
  const slug = name.toLowerCase().replace(/\s+/g, "-");
  return `marco-${slug}.json`;
}

/** Triggers a browser file download with the given content. */
function triggerDownload(content: string, filename: string): void {
  const blob = new Blob([content], { type: "application/json" });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();

  URL.revokeObjectURL(url);
}

/** Exports a project as a downloadable marco-project.json file. */
export function exportProject(project: StoredProject): void {
  const manifest = buildManifest(project);
  const json = JSON.stringify(manifest, null, 2);
  const filename = buildFilename(project.name);

  triggerDownload(json, filename);
}
