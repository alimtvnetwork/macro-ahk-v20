/**
 * Marco Extension — React Options: Cookie Bindings Editor
 */

import { useCallback } from "react";

interface CookieBinding {
    cookieName: string;
    url: string;
    role: "session" | "refresh" | "custom";
    description?: string;
}

interface CookieBindingsEditorProps {
    bindings: CookieBinding[];
    onChange: (bindings: CookieBinding[]) => void;
}

export function CookieBindingsEditor({ bindings, onChange }: CookieBindingsEditorProps) {
    const handleAdd = useCallback(() => {
        onChange([...bindings, { cookieName: "", url: "", role: "session" }]);
    }, [bindings, onChange]);

    const handleRemove = useCallback((index: number) => {
        onChange(bindings.filter((_, i) => i !== index));
    }, [bindings, onChange]);

    const handleUpdate = useCallback((index: number, patch: Partial<CookieBinding>) => {
        onChange(bindings.map((b, i) => i === index ? { ...b, ...patch } : b));
    }, [bindings, onChange]);

    return (
        <>
            <h2 className="section-heading">🍪 Cookie Bindings</h2>
            <p className="section-help">
                Define cookies to extract for authentication. The cookie value is automatically
                resolved and injected as a bearer token or bound variable.
            </p>
            <div>
                {bindings.length === 0 ? (
                    <div className="cookie-empty-state">
                        No cookie bindings configured. Add one to enable automatic token resolution.
                    </div>
                ) : (
                    bindings.map((binding, index) => (
                        <div key={index} className="cookie-binding-row">
                            <div className="cookie-binding-fields">
                                <div className="cookie-field-group">
                                    <label className="form-label" style={{ fontSize: 11 }}>Cookie Name</label>
                                    <input
                                        className="form-input cookie-name"
                                        value={binding.cookieName}
                                        onChange={(e) => handleUpdate(index, { cookieName: e.target.value })}
                                        placeholder="e.g. lovable-session-id.id"
                                    />
                                </div>
                                <div className="cookie-field-group">
                                    <label className="form-label" style={{ fontSize: 11 }}>URL / Domain</label>
                                    <input
                                        className="form-input cookie-url"
                                        value={binding.url}
                                        onChange={(e) => handleUpdate(index, { url: e.target.value })}
                                        placeholder="https://lovable.dev"
                                    />
                                </div>
                                <div className="cookie-field-group">
                                    <label className="form-label" style={{ fontSize: 11 }}>Role</label>
                                    <select
                                        className="form-select cookie-role"
                                        value={binding.role}
                                        onChange={(e) => handleUpdate(index, { role: e.target.value as CookieBinding["role"] })}
                                    >
                                        <option value="session">Session</option>
                                        <option value="refresh">Refresh</option>
                                        <option value="custom">Custom</option>
                                    </select>
                                </div>
                                <div className="cookie-field-group">
                                    <label className="form-label" style={{ fontSize: 11 }}>Description</label>
                                    <input
                                        className="form-input cookie-desc"
                                        value={binding.description ?? ""}
                                        onChange={(e) => handleUpdate(index, { description: e.target.value || undefined })}
                                        placeholder="Optional note"
                                    />
                                </div>
                                <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() => handleRemove(index)}
                                    title="Remove"
                                >
                                    ✕
                                </button>
                            </div>
                        </div>
                    ))
                )}
            </div>
            <button className="btn btn-secondary btn-sm" onClick={handleAdd} style={{ marginTop: 8 }}>
                + Add Cookie Binding
            </button>
        </>
    );
}
