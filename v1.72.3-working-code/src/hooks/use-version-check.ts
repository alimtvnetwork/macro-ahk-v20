/**
 * Marco Extension — Version Mismatch Detection Hook
 *
 * Compares the extension manifest version against the bundled
 * macro-looping.js script-manifest version (via GET_SCRIPT_INFO).
 * Returns mismatch details for the popup to display a warning.
 */

import { useState, useEffect, useCallback } from "react";
import { sendMessage } from "@/lib/message-client";

interface ScriptInfoResponse {
  isOk: boolean;
  bundledVersion?: string;
  scriptName?: string;
  errorMessage?: string;
}

export interface VersionCheckResult {
  loading: boolean;
  hasMismatch: boolean;
  manifestVersion: string | null;
  bundledScriptVersion: string | null;
  error: string | null;
}

/** Read manifest version from chrome.runtime (null outside extension). */
function getManifestVersion(): string | null {
  try {
    const runtime = (globalThis as Record<string, unknown>).chrome as
      | { runtime?: { getManifest?: () => { version?: string } } }
      | undefined;
    if (typeof runtime?.runtime?.getManifest === "function") {
      return runtime.runtime.getManifest().version ?? null;
    }
  } catch {
    /* not in extension context */
  }
  return null;
}

/**
 * Normalise a version string by stripping trailing ".0" segments
 * so that "1.71.0.0" and "1.71.0" compare equal.
 */
function normaliseVersion(v: string): string {
  return v.replace(/(\.0)+$/, "");
}

export function useVersionCheck(): VersionCheckResult {
  const [result, setResult] = useState<VersionCheckResult>({
    loading: true,
    hasMismatch: false,
    manifestVersion: null,
    bundledScriptVersion: null,
    error: null,
  });

  const check = useCallback(async () => {
    const mv = getManifestVersion();
    if (!mv) {
      // Not running inside a Chrome extension — skip
      setResult({
        loading: false,
        hasMismatch: false,
        manifestVersion: null,
        bundledScriptVersion: null,
        error: null,
      });
      return;
    }

    try {
      const info = await sendMessage<ScriptInfoResponse>({
        type: "GET_SCRIPT_INFO",
        scriptName: "macroController",
      } as any);

      if (!info.isOk || !info.bundledVersion) {
        setResult({
          loading: false,
          hasMismatch: false,
          manifestVersion: mv,
          bundledScriptVersion: null,
          error: info.errorMessage ?? "Could not read bundled script version",
        });
        return;
      }

      const normManifest = normaliseVersion(mv);
      const normBundled = normaliseVersion(info.bundledVersion);
      const hasMismatch = normManifest !== normBundled;

      setResult({
        loading: false,
        hasMismatch,
        manifestVersion: mv,
        bundledScriptVersion: info.bundledVersion,
        error: null,
      });
    } catch (err) {
      setResult({
        loading: false,
        hasMismatch: false,
        manifestVersion: mv,
        bundledScriptVersion: null,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }, []);

  useEffect(() => {
    void check();
  }, [check]);

  return result;
}