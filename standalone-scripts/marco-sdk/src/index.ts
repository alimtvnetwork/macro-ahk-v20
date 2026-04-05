/**
 * Riseup Macro SDK — Entry Point
 *
 * Builds and freezes the `window.marco` namespace.
 * This is compiled as an IIFE and injected into the MAIN world
 * before any dependent projects.
 *
 * See: spec/07-devtools-and-injection/sdk-convention.md
 * See: standalone-scripts/marco-sdk/src/instruction.ts
 */

import { createAuthApi } from "./auth";
import { createCookiesApi } from "./cookies";
import { createNotifyApi } from "./notify";
import { createConfigApi, notifyConfigChange } from "./config";
import { createXPathApi, initXPathCache } from "./xpath";
import { createKvApi } from "./kv";
import { createFilesApi } from "./files";
import { createUtilsApi } from "./utils";
import { createPromptsApi } from "./prompts";
import { createApiModule } from "./api";
/* ------------------------------------------------------------------ */
/*  Build namespace                                                    */
/* ------------------------------------------------------------------ */

const marco = Object.freeze({
    auth: Object.freeze(createAuthApi()),
    cookies: Object.freeze(createCookiesApi()),
    config: Object.freeze(createConfigApi()),
    xpath: Object.freeze(createXPathApi()),
    kv: Object.freeze(createKvApi()),
    files: Object.freeze(createFilesApi()),
    notify: Object.freeze(createNotifyApi()),
    utils: Object.freeze(createUtilsApi()),
    prompts: Object.freeze(createPromptsApi()),
    api: Object.freeze(createApiModule()),
    version: "2.18.0",
});

/* ------------------------------------------------------------------ */
/*  Expose globally                                                    */
/* ------------------------------------------------------------------ */

(window as unknown as Record<string, unknown>).marco = marco;

/* ------------------------------------------------------------------ */
/*  RiseupAsiaMacroExt root — extensible container for per-project     */
/*  namespaces registered by the injection handler at runtime.         */
/*  See: spec/01-app-issues/66-sdk-global-object-missing.md            */
/* ------------------------------------------------------------------ */

const win = window as unknown as Record<string, unknown>;
if (!win.RiseupAsiaMacroExt) {
    win.RiseupAsiaMacroExt = { Projects: {} };
}


/* ------------------------------------------------------------------ */
/*  Config change listener (from content script relay)                 */
/* ------------------------------------------------------------------ */

window.addEventListener("message", (event) => {
    if (event.source !== window) return;
    const data = event.data;
    if (!data || data.source !== "marco-sdk-event") return;

    if (data.type === "CONFIG_CHANGED" && data.key) {
        notifyConfigChange(data.key, data.value);
    }
});

/* ------------------------------------------------------------------ */
/*  Warm caches on load                                                */
/* ------------------------------------------------------------------ */

initXPathCache().catch(() => {
    /* silent — cache will be empty until first explicit call */
});

console.log("[marco-sdk] Riseup Macro SDK v2.18.0 initialized (RiseupAsiaMacroExt root created, api + utils + prompts modules loaded)");
