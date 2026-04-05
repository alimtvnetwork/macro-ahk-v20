#!/usr/bin/env node
/**
 * smoke-test-background.mjs
 *
 * Imports the built background/index.js under a mocked Chrome runtime
 * to catch top-level evaluation crashes before deployment.
 *
 * Usage: node scripts/smoke-test-background.mjs
 */

const TIMEOUT_MS = 15_000;

// --- Minimal Chrome API mock ---
globalThis.chrome = {
    runtime: {
        id: "smoke-test",
        getManifest: () => ({ version: "0.0.0" }),
        getURL: (p) => `chrome-extension://smoke/${p}`,
        onMessage: { addListener() {} },
        onInstalled: { addListener() {} },
        onStartup: { addListener() {} },
        lastError: undefined,
        sendMessage() {},
    },
    storage: {
        local: { get: async () => ({}), set: async () => {}, remove: async () => {} },
        session: { get: async () => ({}), set: async () => {}, remove: async () => {} },
        onChanged: { addListener() {} },
    },
    tabs: {
        onRemoved: { addListener() {} },
        query: async () => [],
        sendMessage: async () => {},
        create: async () => ({}),
    },
    action: { onClicked: { addListener() {} } },
    commands: { onCommand: { addListener() {} }, getAll(cb) { cb?.([]); } },
    contextMenus: { removeAll(cb) { cb?.(); }, create: () => {}, onClicked: { addListener() {} } },
    cookies: { onChanged: { addListener() {} }, getAll: async () => [], get: async () => null },
    alarms: { create() {}, onAlarm: { addListener() {} } },
    webNavigation: { onCommitted: { addListener() {} }, onHistoryStateUpdated: { addListener() {} } },
    scripting: { executeScript: async () => [] },
    userScripts: { configureWorld: async () => {} },
};

globalThis.fetch = async () => ({ ok: false, status: 404, arrayBuffer: async () => new ArrayBuffer(0), json: async () => ({}), text: async () => "" });

const timer = setTimeout(() => {
    console.error("❌ Smoke test TIMEOUT after %dms", TIMEOUT_MS);
    process.exit(2);
}, TIMEOUT_MS);

try {
    const bundlePath = new URL("../chrome-extension/dist/background/index.js", import.meta.url).href;
    await import(bundlePath);
    clearTimeout(timer);
    console.log("✅ Background bundle imported successfully (no top-level crash)");
    // Give async registrations a moment to settle
    await new Promise((r) => setTimeout(r, 500));
    console.log("✅ Smoke test PASSED");
    process.exit(0);
} catch (err) {
    clearTimeout(timer);
    console.error("❌ Smoke test FAILED — top-level crash:");
    console.error(err?.stack ?? err);
    process.exit(1);
}
