/**
 * Folder drop parsing utilities for the React Options UI.
 * Mirrors the chrome-extension folder parser for use in React components.
 */

export interface ParsedManifest {
  name: string;
  version: string;
  description: string;
  targetUrls: Array<{ pattern: string; matchType: string }>;
  scripts: Array<{
    path: string;
    order: number;
    runAt?: string;
    configBinding?: string;
  }>;
  configs: Array<{ path: string; description?: string }>;
  settings: Record<string, unknown>;
}

export interface ParsedScriptFile {
  path: string;
  name: string;
  code: string;
  order: number;
  runAt: string;
  configBindingPath: string;
}

export interface ParsedConfigFile {
  path: string;
  name: string;
  json: string;
}

export interface ParsedFolder {
  manifest: ParsedManifest;
  scripts: ParsedScriptFile[];
  configs: ParsedConfigFile[];
}

/** Checks if a DataTransfer contains a directory entry. */
export function hasFolderEntry(dt: DataTransfer): boolean {
  const dirEntry = findDirectoryEntry(dt);
  const hasDirectory = dirEntry !== null;
  return hasDirectory;
}

/** Find the first directory entry in a DataTransfer. */
function findDirectoryEntry(dt: DataTransfer): FileSystemDirectoryEntry | null {
  for (let i = 0; i < dt.items.length; i++) {
    const entry = dt.items[i].webkitGetAsEntry?.();
    if (entry?.isDirectory) return entry as FileSystemDirectoryEntry;
  }
  return null;
}

function readEntryAsText(fileEntry: FileSystemFileEntry): Promise<string> {
  return new Promise((resolve, reject) => {
    fileEntry.file(
      (file: File) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as string);
        reader.onerror = () => reject(reader.error);
        reader.readAsText(file);
      },
      reject,
    );
  });
}

function readDirEntries(dir: FileSystemDirectoryEntry): Promise<FileSystemEntry[]> {
  return new Promise((resolve, reject) => {
    const reader = dir.createReader();
    const all: FileSystemEntry[] = [];
    const batch = () => {
      reader.readEntries((entries) => {
        if (entries.length > 0) { all.push(...entries); batch(); }
        else resolve(all);
      }, reject);
    };
    batch();
  });
}

async function findFile(
  root: FileSystemDirectoryEntry,
  relativePath: string,
): Promise<FileSystemFileEntry | null> {
  const segments = relativePath.split("/").filter(Boolean);
  let dir: FileSystemDirectoryEntry = root;

  for (let i = 0; i < segments.length; i++) {
    const entries = await readDirEntries(dir);
    const match = entries.find((e) => e.name === segments[i]);
    const isMissing = match === undefined;
    if (isMissing) return null;

    const isLastSegment = i === segments.length - 1;
    if (isLastSegment) return match.isFile ? (match as FileSystemFileEntry) : null;

    const isFile = !match.isDirectory;
    if (isFile) return null;

    dir = match as FileSystemDirectoryEntry;
  }
  return null;
}

/** Parses a dropped folder from DataTransfer into a ParsedFolder. */
export async function parseDroppedFolder(dt: DataTransfer): Promise<ParsedFolder> {
  const folderEntry = findDirectoryEntry(dt);
  const isFolderMissing = folderEntry === null;
  if (isFolderMissing) throw new Error("No folder found in drop.");

  const manifestEntry = await findFile(folderEntry, "marco-project.json");
  const isManifestMissing = manifestEntry === null;
  if (isManifestMissing) throw new Error("No marco-project.json found in folder.");

  const raw = JSON.parse(await readEntryAsText(manifestEntry));
  const isNameMissing = !raw.name;
  if (isNameMissing) throw new Error("marco-project.json missing 'name' field.");

  const manifest: ParsedManifest = {
    name: raw.name,
    version: raw.version ?? "1.0.0",
    description: raw.description ?? "",
    targetUrls: Array.isArray(raw.targetUrls) ? raw.targetUrls : [],
    scripts: Array.isArray(raw.scripts) ? raw.scripts : [],
    configs: Array.isArray(raw.configs) ? raw.configs : [],
    settings: typeof raw.settings === "object" ? raw.settings : {},
  };

  // Resolve scripts
  const scripts: ParsedScriptFile[] = [];
  for (const entry of manifest.scripts) {
    const fe = await findFile(folderEntry, entry.path);
    const code = fe ? await readEntryAsText(fe) : "";
    scripts.push({
      path: entry.path,
      name: entry.path.split("/").pop() ?? entry.path,
      code,
      order: entry.order ?? scripts.length,
      runAt: entry.runAt ?? "document_idle",
      configBindingPath: entry.configBinding ?? "",
    });
  }

  // Resolve configs
  const configPaths = new Set<string>();
  for (const c of manifest.configs) configPaths.add(c.path);
  for (const s of manifest.scripts) {
    if (s.configBinding) configPaths.add(s.configBinding);
  }

  const configs: ParsedConfigFile[] = [];
  for (const path of configPaths) {
    const fe = await findFile(folderEntry, path);
    const json = fe ? await readEntryAsText(fe) : "{}";
    configs.push({ path, name: path.split("/").pop() ?? path, json });
  }

  return { manifest, scripts, configs };
}
