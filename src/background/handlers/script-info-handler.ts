/**
 * Marco Extension — Script Info & Hot-Reload Handler (Issue 77)
 *
 * GET_SCRIPT_INFO: Reads instruction.json from the bundled
 * web_accessible_resources to return version metadata.
 *
 * HOT_RELOAD_SCRIPT: Fetches the latest bundled JS from the extension's
 * dist/ and re-injects it into the requesting tab via the existing
 * injection pipeline.
 *
 * @see spec/05-chrome-extension/08-version-management.md — Version management
 * @see spec/05-chrome-extension/17-build-system.md — Build system
 */

import type { MessageRequest } from "../../shared/messages";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface InstructionManifest {
    name: string;
    displayName: string;
    version: string;
    description?: string;
    world?: string;
    dependencies?: string[];
    assets?: {
        scripts?: Array<{ file: string; order: number; isIife?: boolean }>;
        css?: Array<{ file: string }>;
        configs?: Array<{ file: string; key: string }>;
        templates?: Array<{ file: string }>;
    };
}

export interface ScriptInfoResponse {
    isOk: true;
    scriptName: string;
    bundledVersion: string;
    outputFile: string;
    sizeBytes: number | null;
}

export interface HotReloadResponse {
    isOk: true;
    scriptName: string;
    version: string;
    scriptSource: string;
    bundledVersion: string;
    outputFile: string;
    sizeBytes: number | null;
}

interface ErrorResult {
    isOk: false;
    errorMessage: string;
}

/* ------------------------------------------------------------------ */
/*  Script folder mapping                                              */
/* ------------------------------------------------------------------ */

/** Maps logical script names to their folder under projects/scripts/ */
const SCRIPT_FOLDER_MAP: Record<string, string> = {
    macroController: "macro-controller",
    "marco-sdk": "marco-sdk",
    xpath: "xpath",
};

function resolveScriptFolder(scriptName: string): string | null {
    return SCRIPT_FOLDER_MAP[scriptName] ?? null;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Fetches and parses a project's instruction.json from extension dist. */
async function fetchInstruction(folder: string): Promise<InstructionManifest> {
    const url = chrome.runtime.getURL(
        `projects/scripts/${folder}/instruction.json`,
    );
    const res = await fetch(url);
    if (!res.ok) {
        throw new Error(`Failed to fetch instruction.json: ${res.status}`);
    }
    return res.json() as Promise<InstructionManifest>;
}

/** Gets the primary output file from an instruction manifest. */
function getPrimaryOutputFile(instruction: InstructionManifest): string | null {
    const scripts = instruction.assets?.scripts;
    if (!scripts?.length) return null;
    // Sort by order and return the first script's file
    const sorted = [...scripts].sort((a, b) => a.order - b.order);
    return sorted[0].file;
}

/* ------------------------------------------------------------------ */
/*  GET_SCRIPT_INFO                                                    */
/* ------------------------------------------------------------------ */

/* Handler function is inherently sequential — suppress false positive */
export async function handleGetScriptInfo(
    message: MessageRequest,
): Promise<ScriptInfoResponse | ErrorResult> {
    const msg = message as MessageRequest & { scriptName: string };
    const scriptName = msg.scriptName;

    const folder = resolveScriptFolder(scriptName);
    if (!folder) {
        return { isOk: false, errorMessage: `Unknown script: ${scriptName}` };
    }

    try {
        const instruction = await fetchInstruction(folder);
        const outputFile = getPrimaryOutputFile(instruction);

        if (!outputFile) {
            return { isOk: false, errorMessage: `No scripts declared in instruction.json for ${folder}` };
        }

        // Optionally get file size
        let sizeBytes: number | null = null;
        try {
            const scriptUrl = chrome.runtime.getURL(
                `projects/scripts/${folder}/${outputFile}`,
            );
            const headRes = await fetch(scriptUrl, { method: "HEAD" });
            const cl = headRes.headers.get("content-length");
            if (cl) sizeBytes = parseInt(cl, 10);
        } catch {
            // Size is optional — ignore errors
        }

        return {
            isOk: true,
            scriptName: instruction.name,
            bundledVersion: instruction.version,
            outputFile,
            sizeBytes,
        };
    } catch (err) {
        return {
            isOk: false,
            errorMessage: `Script info error: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}

/* ------------------------------------------------------------------ */
/*  HOT_RELOAD_SCRIPT                                                  */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
export async function handleHotReloadScript(
    message: MessageRequest,
): Promise<HotReloadResponse | ErrorResult> {
    const msg = message as MessageRequest & { scriptName: string };
    const scriptName = msg.scriptName;

    const folder = resolveScriptFolder(scriptName);
    if (!folder) {
        return { isOk: false, errorMessage: `Unknown script: ${scriptName}` };
    }

    try {
        const instruction = await fetchInstruction(folder);
        const outputFile = getPrimaryOutputFile(instruction);

        if (!outputFile) {
            return { isOk: false, errorMessage: `No scripts declared in instruction.json for ${folder}` };
        }

        const scriptUrl = chrome.runtime.getURL(
            `projects/scripts/${folder}/${outputFile}`,
        );
        const scriptRes = await fetch(scriptUrl);
        if (!scriptRes.ok) {
            return {
                isOk: false,
                errorMessage: `Script fetch failed: ${scriptRes.status}`,
            };
        }
        const scriptSource = await scriptRes.text();

        let sizeBytes: number | null = null;
        const contentLength = scriptRes.headers.get("content-length");
        if (contentLength) {
            sizeBytes = parseInt(contentLength, 10);
        }
        if (sizeBytes === null) {
            sizeBytes = scriptSource.length;
        }

        console.log(
            `[Marco] HOT_RELOAD_SCRIPT: ${scriptName} v${instruction.version} (${scriptSource.length} bytes)`,
        );

        return {
            isOk: true,
            scriptName: instruction.name,
            version: instruction.version,
            bundledVersion: instruction.version,
            outputFile,
            sizeBytes,
            scriptSource,
        };
    } catch (err) {
        return {
            isOk: false,
            errorMessage: `Hot-reload error: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}
