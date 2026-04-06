/**
 * useTokenWatchdog — Monitors JWT expiry and auto-refreshes when < 5 min remaining.
 *
 * Decodes the JWT payload to extract `exp`, runs a 10s interval to update TTL,
 * and triggers REFRESH_TOKEN when TTL drops below the threshold.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { sendMessage } from "@/lib/message-client";

const REFRESH_THRESHOLD_SEC = 5 * 60; // 5 minutes
const POLL_INTERVAL_MS = 10_000; // 10 seconds

export interface TokenWatchdogState {
  /** Current token (masked for display) */
  maskedToken: string;
  /** Seconds until expiry, or null if unknown */
  ttlSec: number | null;
  /** Human-readable TTL string */
  ttlDisplay: string;
  /** Whether token is within the warning zone (< 5 min) */
  isWarning: boolean;
  /** Whether token is expired */
  isExpired: boolean;
  /** Source of the token */
  source: string;
  /** JWT subject (sub claim) */
  subject: string;
  /** ISO string of when the token was issued */
  issuedAt: string;
  /** ISO string of when the token expires */
  expiresAt: string;
  /** Last refresh attempt result */
  lastRefreshResult: "success" | "failed" | "pending" | null;
  /** Whether a refresh is in progress */
  refreshing: boolean;
  /** Force a manual refresh */
  forceRefresh: () => Promise<void>;
  /** Reload token state */
  reload: () => Promise<void>;
}

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const payload = parts[1];
    const decoded = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(decoded);
  } catch {
    return null;
  }
}

function extractToken(result: Record<string, unknown> | null): string | null {
  if (!result) return null;
  for (const key of ["token", "authToken", "sessionId"]) {
    const val = result[key];
    if (typeof val === "string" && val.length > 0) return val;
  }
  return null;
}

function formatTtl(sec: number | null): string {
  if (sec === null) return "Unknown";
  if (sec <= 0) return "Expired";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

function maskToken(token: string | null): string {
  if (!token) return "No token";
  if (token.length < 20) return "•".repeat(token.length);
  return `${token.slice(0, 8)}…${token.slice(-6)}`;
}

export function useTokenWatchdog(): TokenWatchdogState {
  const [rawToken, setRawToken] = useState<string | null>(null);
  const [ttlSec, setTtlSec] = useState<number | null>(null);
  const [source, setSource] = useState("unknown");
  const [subject, setSubject] = useState("");
  const [issuedAt, setIssuedAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [lastRefreshResult, setLastRefreshResult] = useState<"success" | "failed" | "pending" | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const autoRefreshTriggered = useRef(false);
  const expRef = useRef<number | null>(null);

  const updateFromToken = useCallback((token: string | null, src: string) => {
    setRawToken(token);
    setSource(src);

    if (!token) {
      setTtlSec(null);
      setSubject("");
      setIssuedAt("");
      setExpiresAt("");
      expRef.current = null;
      return;
    }

    const payload = decodeJwtPayload(token);
    if (!payload) {
      setTtlSec(null);
      expRef.current = null;
      return;
    }

    const exp = typeof payload.exp === "number" ? payload.exp : null;
    const iat = typeof payload.iat === "number" ? payload.iat : null;
    const sub = typeof payload.sub === "string" ? payload.sub : "";

    expRef.current = exp;
    setSubject(sub);
    setIssuedAt(iat ? new Date(iat * 1000).toISOString() : "");
    setExpiresAt(exp ? new Date(exp * 1000).toISOString() : "");

    if (exp) {
      const remaining = exp - Math.floor(Date.now() / 1000);
      setTtlSec(remaining);
    } else {
      setTtlSec(null);
    }
  }, []);

  const fetchToken = useCallback(async () => {
    try {
      const result = await sendMessage<Record<string, unknown>>({ type: "GET_TOKEN" });
      const token = extractToken(result);
      const src = typeof result.source === "string" ? result.source : "extension";
      updateFromToken(token, src);
    } catch {
      updateFromToken(null, "error");
    }
  }, [updateFromToken]);

  const doRefresh = useCallback(async () => {
    setRefreshing(true);
    setLastRefreshResult("pending");
    try {
      const result = await sendMessage<Record<string, unknown>>({ type: "REFRESH_TOKEN" });
      const token = extractToken(result);
      if (token) {
        updateFromToken(token, typeof result.source === "string" ? result.source : "extension");
        setLastRefreshResult("success");
        autoRefreshTriggered.current = false;
      } else {
        setLastRefreshResult("failed");
      }
    } catch {
      setLastRefreshResult("failed");
    } finally {
      setRefreshing(false);
    }
  }, [updateFromToken]);

  // Initial fetch
  useEffect(() => {
    void fetchToken();
  }, [fetchToken]);

  // TTL countdown + auto-refresh
  useEffect(() => {
    const interval = setInterval(() => {
      const exp = expRef.current;
      if (exp === null) return;

      const remaining = exp - Math.floor(Date.now() / 1000);
      setTtlSec(remaining);

      // Auto-refresh when below threshold
      if (remaining > 0 && remaining <= REFRESH_THRESHOLD_SEC && !autoRefreshTriggered.current) {
        autoRefreshTriggered.current = true;
        void doRefresh();
      }
    }, POLL_INTERVAL_MS);

    return () => clearInterval(interval);
  }, [doRefresh]);

  const isWarning = ttlSec !== null && ttlSec > 0 && ttlSec <= REFRESH_THRESHOLD_SEC;
  const isExpired = ttlSec !== null && ttlSec <= 0;

  return {
    maskedToken: maskToken(rawToken),
    ttlSec,
    ttlDisplay: formatTtl(ttlSec),
    isWarning,
    isExpired,
    source,
    subject,
    issuedAt,
    expiresAt,
    lastRefreshResult,
    refreshing,
    forceRefresh: doRefresh,
    reload: fetchToken,
  };
}
