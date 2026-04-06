/**
 * Marco Extension — React Popup: Injection Results
 *
 * Per-script injection feedback with skip reason badges
 * (DISABLED ⏸️, MISSING 🔍, MISMATCH ⚠️).
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface InjectionResultEntry {
    scriptId: string;
    isSuccess: boolean;
    errorMessage?: string;
    durationMs?: number;
    skipReason?: "disabled" | "missing" | "resolver_mismatch";
    scriptName?: string;
}

interface InjectionResultsProps {
    results: InjectionResultEntry[];
    isVisible: boolean;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function getResultIcon(result: InjectionResultEntry): string {
    if (result.isSuccess) return "✅";
    if (result.skipReason === "disabled") return "⏸️";
    if (result.skipReason === "missing") return "🔍";
    if (result.skipReason === "resolver_mismatch") return "⚠️";
    return "❌";
}

const SKIP_LABELS: Record<string, string> = {
    disabled: "DISABLED",
    missing: "NOT FOUND",
    resolver_mismatch: "MISMATCH",
};

function getRowClass(result: InjectionResultEntry): string {
    if (result.isSuccess) return "injection-result-row";
    if (result.skipReason) return "injection-result-row injection-result-row--skipped";
    return "injection-result-row injection-result-row--failed";
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function InjectionResults({ results, isVisible }: InjectionResultsProps) {
    if (!isVisible || results.length === 0) {
        return null;
    }

    return (
        <div className="section injection-results">
            <div className="section-title">💉 Injection Results</div>
            {results.map((result, index) => {
                const name = result.scriptName ?? result.scriptId;
                const icon = getResultIcon(result);
                const durationText = result.durationMs != null && result.durationMs > 0
                    ? ` (${result.durationMs}ms)`
                    : "";
                const hasError = !result.isSuccess && result.errorMessage;
                const skipLabel = result.skipReason
                    ? SKIP_LABELS[result.skipReason] ?? "SKIPPED"
                    : null;

                return (
                    <div key={`${result.scriptId}-${index}`} className={getRowClass(result)}>
                        <div className="injection-result-header">
                            <span>{icon}</span>
                            <span className="injection-result-name">{name}</span>
                            {skipLabel && (
                                <span className={`injection-result-badge injection-result-badge--${result.skipReason}`}>
                                    {skipLabel}
                                </span>
                            )}
                            <span className="injection-result-duration">{durationText}</span>
                        </div>
                        {hasError && (
                            <div className="injection-result-error">
                                {result.errorMessage}
                            </div>
                        )}
                    </div>
                );
            })}
        </div>
    );
}
