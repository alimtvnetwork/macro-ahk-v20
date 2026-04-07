/**
 * Marco Extension — Injection Timing History
 *
 * Tracks cumulative injection latency across multiple runs.
 * Logs min/max/avg after each injection and exposes stats
 * for diagnostics and the popup performance bar.
 *
 * @see .lovable/memory/architecture/injection-pipeline-optimization.md — Pipeline perf strategy
 * @see spec/17-app-issues/87-injection-pipeline-performance/implementation-plan.md — Perf plan
 */

const MAX_HISTORY = 100;

interface TimingEntry {
    timestampMs: number;
    durationMs: number;
    scriptCount: number;
    budgetMs: number;
}

interface TimingStats {
    count: number;
    minMs: number;
    maxMs: number;
    avgMs: number;
    p95Ms: number;
    lastMs: number;
    overBudgetCount: number;
    history: readonly TimingEntry[];
}

const _history: TimingEntry[] = [];

/** Record a pipeline run and log cumulative stats. */
export function recordInjectionTiming(
    durationMs: number,
    scriptCount: number,
    budgetMs: number,
): TimingStats {
    _history.push({
        timestampMs: Date.now(),
        durationMs,
        scriptCount,
        budgetMs,
    });

    // Trim to max size
    if (_history.length > MAX_HISTORY) {
        _history.splice(0, _history.length - MAX_HISTORY);
    }

    const stats = getTimingStats();

    console.log(
        "[injection] ── HISTORY ── runs=%d min=%.1fms max=%.1fms avg=%.1fms p95=%.1fms overBudget=%d/%d",
        stats.count,
        stats.minMs,
        stats.maxMs,
        stats.avgMs,
        stats.p95Ms,
        stats.overBudgetCount,
        stats.count,
    );

    return stats;
}

/** Compute stats from recorded history. */
export function getTimingStats(): TimingStats {
    if (_history.length === 0) {
        return {
            count: 0,
            minMs: 0,
            maxMs: 0,
            avgMs: 0,
            p95Ms: 0,
            lastMs: 0,
            overBudgetCount: 0,
            history: [],
        };
    }

    const durations = _history.map((e) => e.durationMs);
    const sorted = [...durations].sort((a, b) => a - b);
    const sum = durations.reduce((a, b) => a + b, 0);
    const p95Idx = Math.min(Math.floor(sorted.length * 0.95), sorted.length - 1);
    const overBudgetCount = _history.filter((e) => e.durationMs > e.budgetMs).length;

    return {
        count: _history.length,
        minMs: Math.round(sorted[0] * 10) / 10,
        maxMs: Math.round(sorted[sorted.length - 1] * 10) / 10,
        avgMs: Math.round((sum / _history.length) * 10) / 10,
        p95Ms: Math.round(sorted[p95Idx] * 10) / 10,
        lastMs: Math.round(durations[durations.length - 1] * 10) / 10,
        overBudgetCount,
        history: _history,
    };
}

/** Reset history (for testing). */
export function resetTimingHistory(): void {
    _history.length = 0;
}
