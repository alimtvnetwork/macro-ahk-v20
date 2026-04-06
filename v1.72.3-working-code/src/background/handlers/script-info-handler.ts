/**
 * Marco Extension — Script Info & Hot-Reload Handler (Issue 77)
 *
 * GET_SCRIPT_INFO: Reads script-manifest.json from the bundled
 * web_accessible_resources to return version metadata.
 *
 * HOT_RELOAD_SCRIPT: Fetches the latest bundled JS from the extension's
 * dist/ and re-injects it into the requesting tab via the existing
 * injection pipeline.
 */

import type { MessageRequest } from "../../shared/messages";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ScriptManifest {
    name: string;
    displayName: string;
    version: string;
    outputFile: string;
    world?: string;
    description?: string;
    assets?: { css?: string; templates?: string };
    dependencies?: string[];
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
/*  GET_SCRIPT_INFO                                                    */
/* ------------------------------------------------------------------ */

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
        const manifestUrl = chrome.runtime.getURL(
            `projects/scripts/${folder}/script-manifest.json`,
        );
        const manifestRes = await fetch(manifestUrl);
        if (!manifestRes.ok) {
            return {
                isOk: false,
                errorMessage: `Failed to fetch manifest: ${manifestRes.status}`,
            };
        }

        const manifest: ScriptManifest = await manifestRes.json();

        // Optionally get file size
        let sizeBytes: number | null = null;
        try {
            const scriptUrl = chrome.runtime.getURL(
                `projects/scripts/${folder}/${manifest.outputFile}`,
            );
            const headRes = await fetch(scriptUrl, { method: "HEAD" });
            const cl = headRes.headers.get("content-length");
            if (cl) sizeBytes = parseInt(cl, 10);
        } catch {
            // Size is optional — ignore errors
        }

        return {
            isOk: true,
            scriptName: manifest.name,
            bundledVersion: manifest.version,
            outputFile: manifest.outputFile,
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
        // 1. Read manifest for version info
        const manifestUrl = chrome.runtime.getURL(
            `projects/scripts/${folder}/script-manifest.json`,
        );
        const manifestRes = await fetch(manifestUrl);
        if (!manifestRes.ok) {
            return {
                isOk: false,
                errorMessage: `Manifest fetch failed: ${manifestRes.status}`,
            };
        }
        const manifest: ScriptManifest = await manifestRes.json();

        // 2. Read the full script source
        const scriptUrl = chrome.runtime.getURL(
            `projects/scripts/${folder}/${manifest.outputFile}`,
        );
        const scriptRes = await fetch(scriptUrl);
        if (!scriptRes.ok) {
            return {
                isOk: false,
                errorMessage: `Script fetch failed: ${scriptRes.status}`,
            };
        }
        const scriptSource = await scriptRes.text();

        console.log(
            `[Marco] HOT_RELOAD_SCRIPT: ${scriptName} v${manifest.version} (${scriptSource.length} bytes)`,
        );

        return {
            isOk: true,
            scriptName: manifest.name,
            version: manifest.version,
            scriptSource,
        };
    } catch (err) {
        return {
            isOk: false,
            errorMessage: `Hot-reload error: ${err instanceof Error ? err.message : String(err)}`,
        };
    }
}
