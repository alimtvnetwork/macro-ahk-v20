/**
 * Startup Timing Waterfall — records elapsed time per bootstrap phase.
 * Used by Auth Diagnostics panel to visualize startup performance.
 */

export interface TimingEntry {
  phase: string;
  label: string;
  startMs: number;
  endMs: number;
  status: 'ok' | 'warn' | 'error' | 'pending';
  detail?: string;
}

const _t0 = Date.now();
const _entries: TimingEntry[] = [];
const _pending = new Map<string, { label: string; startMs: number }>();

/** Mark the start of a phase (relative to module load). */
export function timingStart(phase: string, label: string): void {
  _pending.set(phase, { label, startMs: Date.now() - _t0 });
}

/** Mark the end of a phase. */
export function timingEnd(
  phase: string,
  status: TimingEntry['status'] = 'ok',
  detail?: string,
): void {
  const p = _pending.get(phase);
  if (!p) return;
  _pending.delete(phase);
  _entries.push({
    phase,
    label: p.label,
    startMs: p.startMs,
    endMs: Date.now() - _t0,
    status,
    detail,
  });
}

/** Get all completed entries, sorted by start time. */
export function getTimingEntries(): TimingEntry[] {
  // Also snapshot any still-pending phases
  const now = Date.now() - _t0;
  const all = [..._entries];
  _pending.forEach(function(v, k) {
    all.push({ phase: k, label: v.label, startMs: v.startMs, endMs: now, status: 'pending' });
  });
  return all.sort(function(a, b) { return a.startMs - b.startMs; });
}

/** Total elapsed time since module load. */
export function getTimingSinceLoadMs(): number {
  return Date.now() - _t0;
}
