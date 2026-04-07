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

/**
 * Log a formatted timing summary to the console.
 * Called at the end of bootstrap to provide a single diagnostic view
 * of all startup phases with durations and statuses.
 *
 * T10: Timing instrumentation for RC-01 diagnostics.
 */
export function logTimingSummary(): void {
  const entries = getTimingEntries();
  const totalMs = getTimingSinceLoadMs();

  if (entries.length === 0) {
    console.log('[MacroLoop] ── TIMING ── No phases recorded');
    return;
  }

  const statusIcons: Record<string, string> = {
    ok: '✅',
    warn: '⚠️',
    error: '❌',
    pending: '⏳',
  };

  const lines: string[] = [
    '',
    '┌─────────────────────────────────────────────────────────────────┐',
    '│  [MacroLoop] ── STARTUP TIMING WATERFALL ──                    │',
    '├──────────────────────────┬────────┬────────┬────────┬──────────┤',
    '│ Phase                    │ Start  │  End   │  Dur   │ Status   │',
    '├──────────────────────────┼────────┼────────┼────────┼──────────┤',
  ];

  for (const e of entries) {
    const dur = e.endMs - e.startMs;
    const icon = statusIcons[e.status] || '?';
    const phase = (e.label || e.phase).substring(0, 24).padEnd(24);
    const start = (e.startMs + 'ms').padStart(6);
    const end = (e.endMs + 'ms').padStart(6);
    const durStr = (dur + 'ms').padStart(6);
    const detail = e.detail ? ' · ' + e.detail.substring(0, 30) : '';
    lines.push('│ ' + phase + ' │ ' + start + ' │ ' + end + ' │ ' + durStr + ' │ ' + icon + detail.padEnd(8) + ' │');
  }

  lines.push('├──────────────────────────┴────────┴────────┴────────┴──────────┤');
  lines.push('│  Total: ' + totalMs + 'ms | Phases: ' + entries.length + '                                       │'.substring(0, 55) + '│');

  // Append version number for quick identification in console
  try {
    // Dynamic import to avoid circular dependency — VERSION may not be available at module load
    const ver = (typeof window !== 'undefined' && (window as Record<string, unknown>).RiseupAsiaMacroExt)
      ? String(((window as Record<string, unknown>).RiseupAsiaMacroExt as Record<string, unknown>)?.Projects?.MacroController?.meta?.version || '?')
      : '?';
    lines.push('│  Version: v' + ver + '                                                    │'.substring(0, 55) + '│');
  } catch {
    // Version unavailable — skip
  }

  lines.push('└─────────────────────────────────────────────────────────────────┘');

  console.log(lines.join('\n'));
}
