// Marco Script — Keyboard Shortcuts
// Order: 3 | RunAt: document_idle
// Reads config from __MARCO_CONFIG__["shortcut-map"]

(function keyboardShortcuts() {
    const config = window.__MARCO_CONFIG__?.["shortcut-map"];
    const hasConfig = config !== undefined && config !== null;

    if (!hasConfig) {
        console.warn("[Marco] Shortcut config not found, skipping");
        return;
    }

    const bindings = config.bindings ?? [];
    const hasBindings = bindings.length > 0;

    if (!hasBindings) {
        return;
    }

    function handleKeyDown(event) {
        const pressedCombo = buildComboString(event);

        const matchedBinding = bindings.find(
            (binding) => binding.keys === pressedCombo,
        );

        const hasMatch = matchedBinding !== undefined;

        if (hasMatch) {
            event.preventDefault();
            console.log("[Marco] Shortcut fired:", matchedBinding.action);
        }
    }

    function buildComboString(event) {
        const parts = [];

        if (event.ctrlKey) parts.push("Ctrl");
        if (event.shiftKey) parts.push("Shift");
        if (event.altKey) parts.push("Alt");
        parts.push(event.key.toUpperCase());

        return parts.join("+");
    }

    document.addEventListener("keydown", handleKeyDown);
    console.log("[Marco] Registered", bindings.length, "shortcuts");
})();
