/**
 * Marco Extension — React Options: URL Rules Editor
 */

import { useCallback } from "react";

interface UrlRule {
    pattern: string;
    matchType: string;
}

interface UrlRulesEditorProps {
    rules: UrlRule[];
    onChange: (rules: UrlRule[]) => void;
}

export function UrlRulesEditor({ rules, onChange }: UrlRulesEditorProps) {
    const handleAdd = useCallback(() => {
        onChange([...rules, { pattern: "", matchType: "glob" }]);
    }, [rules, onChange]);

    const handleRemove = useCallback((index: number) => {
        onChange(rules.filter((_, i) => i !== index));
    }, [rules, onChange]);

    const handleUpdate = useCallback((index: number, field: keyof UrlRule, value: string) => {
        const updated = rules.map((r, i) => i === index ? { ...r, [field]: value } : r);
        onChange(updated);
    }, [rules, onChange]);

    return (
        <>
            <div id="url-rules-container">
                {rules.length === 0 ? (
                    <div className="empty-state" style={{ padding: 16 }}>
                        No URL rules yet. Add one to start matching pages.
                    </div>
                ) : (
                    rules.map((rule, index) => (
                        <div key={index} className="rule-card">
                            <div className="rule-header">
                                <strong>Rule {index + 1}</strong>
                                <button
                                    className="btn btn-danger btn-sm"
                                    onClick={() => handleRemove(index)}
                                >
                                    Remove
                                </button>
                            </div>
                            <div className="rule-fields">
                                <span className="rule-field-label">Match Type</span>
                                <select
                                    className="form-select rule-match-type"
                                    value={rule.matchType}
                                    onChange={(e) => handleUpdate(index, "matchType", e.target.value)}
                                    style={{ maxWidth: 200 }}
                                >
                                    <option value="glob">Glob</option>
                                    <option value="prefix">Prefix</option>
                                    <option value="exact">Exact</option>
                                    <option value="regex">Regex</option>
                                </select>
                                <span className="rule-field-label">Pattern</span>
                                <input
                                    className="form-input rule-pattern"
                                    value={rule.pattern}
                                    onChange={(e) => handleUpdate(index, "pattern", e.target.value)}
                                    placeholder="https://example.com/*"
                                />
                            </div>
                        </div>
                    ))
                )}
            </div>
            <button className="btn btn-secondary" onClick={handleAdd} style={{ marginTop: 8 }}>
                + Add URL Rule
            </button>
        </>
    );
}
