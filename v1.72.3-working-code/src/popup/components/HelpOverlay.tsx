/**
 * Marco Extension — React Popup: Help Overlay
 *
 * Modal overlay showing keyboard shortcuts and action descriptions.
 */

interface HelpOverlayProps {
    isOpen: boolean;
    onClose: () => void;
}

export function HelpOverlay({ isOpen, onClose }: HelpOverlayProps) {
    if (!isOpen) return null;

    return (
        <div className="help-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
            <div className="help-content">
                <div className="help-header">
                    <span>⚡ Marco Help</span>
                    <button className="help-close" onClick={onClose}>✕</button>
                </div>
                <div className="help-section">
                    <strong>▶️ Run</strong> — Inject all enabled scripts into the active tab
                </div>
                <div className="help-section">
                    <strong>🔁 Re-inject</strong> — Clear existing markers & re-run all scripts fresh
                </div>
                <div className="help-section">
                    <strong>📋 Logs</strong> — Copy session logs & errors to clipboard as JSON
                </div>
                <div className="help-section">
                    <strong>📦 Export Logs</strong> — Download logs + errors + DB as a ZIP bundle
                </div>
                <div className="help-section">
                    <strong>💾 Export Project</strong> — Export active project as JSON
                </div>
                <div className="help-section">
                    <strong>📥 Import Project</strong> — Import a project JSON file
                </div>
                <div className="help-section">
                    <strong>🔄 Toggle</strong> — Enable/disable the active project
                </div>
                <div className="help-divider" />
                <div className="help-section help-shortcuts">
                    <strong>Keyboard Shortcuts</strong>
                    <div>Ctrl+Shift+↓ — Run scripts</div>
                    <div>Configure in chrome://extensions/shortcuts</div>
                </div>
            </div>
        </div>
    );
}
