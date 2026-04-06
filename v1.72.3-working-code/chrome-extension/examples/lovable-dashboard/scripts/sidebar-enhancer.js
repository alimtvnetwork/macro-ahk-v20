// Marco Script — Sidebar Enhancer
// Order: 2 | RunAt: document_idle
// Reads config from __MARCO_CONFIG__["sidebar-settings"]

(function sidebarEnhancer() {
    const config = window.__MARCO_CONFIG__?.["sidebar-settings"];
    const hasConfig = config !== undefined && config !== null;

    if (!hasConfig) {
        console.warn("[Marco] Sidebar config not found, using defaults");
    }

    const isCollapsible = hasConfig
        ? config.collapsibleSections
        : true;

    const hiddenSections = hasConfig
        ? config.hiddenSections
        : [];

    function applySidebarTweaks() {
        console.log("[Marco] Sidebar enhancer active", {
            isCollapsible,
            hiddenSections,
        });
    }

    applySidebarTweaks();
})();
