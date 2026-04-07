/**
 * Marco Extension — Settings Namespace Builder
 *
 * Generates an IIFE that registers `window.RiseupAsiaMacroExt.Settings`
 * and `window.RiseupAsiaMacroExt.docs` as frozen, read-only objects.
 *
 * Categories:
 *   - Broadcast: HTTP proxy port
 *   - Logging: debug mode, log retention
 *   - Injection: defaultRunAt, forceLegacy, chatBoxXPath
 *   - Limits: maxCycleCount, idleTimeout
 *   - General: autoRun, notifications, theme
 *
 * See: spec/17-app-issues/75-sdk-namespace-enrichment-and-developer-tooling.md
 */

import type { ExtensionSettings } from "./handlers/settings-handler";

// eslint-disable-next-line max-lines-per-function
export function buildSettingsNamespaceScript(
    settings: ExtensionSettings,
    llmGuide?: string,
): string {
    const safe = (v: string) =>
        v.replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n");

    // Escape the LLM guide for embedding as a JS string literal
    const guideStr = llmGuide
        ? `"${safe(llmGuide)}"`
        : '""';

    return `;(function(){
/* RiseupAsiaMacroExt.Settings + docs — read-only extension settings */
var root = window.RiseupAsiaMacroExt;
if (!root) { root = { Projects: {} }; window.RiseupAsiaMacroExt = root; }

root.Settings = Object.freeze({
  Broadcast: Object.freeze({
    Port: ${settings.broadcastPort},
    BaseUrl: "http://localhost:${settings.broadcastPort}"
  }),
  Logging: Object.freeze({
    DebugMode: ${settings.debugMode},
    RetentionDays: ${settings.logRetentionDays}
  }),
  Injection: Object.freeze({
    DefaultRunAt: "${safe(settings.defaultRunAt)}",
    ForceLegacy: ${settings.forceLegacyInjection},
    ChatBoxXPath: "${safe(settings.chatBoxXPath)}",
    BudgetMs: ${settings.injectionBudgetMs ?? 500}
  }),
  Limits: Object.freeze({
    MaxCycleCount: ${settings.maxCycleCount},
    IdleTimeout: ${settings.idleTimeout}
  }),
  General: Object.freeze({
    AutoRunOnPageLoad: ${settings.autoRunOnPageLoad},
    ShowNotifications: ${settings.showNotifications},
    Theme: "${safe(settings.theme)}"
  })
});

root.docs = Object.freeze({
  llmGuide: ${guideStr}
});

console.log("[settings-ns] Registered RiseupAsiaMacroExt.Settings + docs");
})();`;
}
