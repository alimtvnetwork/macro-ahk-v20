// Marco Script — Setup Namespace
// Order: 1 | RunAt: document_start
// Creates the global Marco namespace used by all subsequent scripts.

(function setupNamespace() {
    const isNamespaceReady = typeof window.__MARCO__ !== "undefined";

    if (isNamespaceReady) {
        return;
    }

    window.__MARCO__ = {
        version: "1.0.0",
        ready: false,
        modules: {},
    };
})();
