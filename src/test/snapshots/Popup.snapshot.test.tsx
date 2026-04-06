/**
 * Popup Page — Structural Snapshot Test
 *
 * Catches unintended UI drift across web and Chrome extension environments.
 * If the snapshot changes, review the diff and update with `vitest -u`.
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

/* ── Mock hooks before importing the component ──────────────────── */

vi.mock("@/hooks/use-popup-data", () => ({
  usePopupData: () => ({
    projectData: {
      activeProject: { id: "proj-1", name: "Lovable Dashboard", version: "1.2.0", description: "Automation scripts" },
      allProjects: [
        { id: "proj-1", name: "Lovable Dashboard", version: "1.2.0" },
        { id: "proj-2", name: "GitHub Enhancements", version: "0.3.1" },
      ],
    },
    status: {
      connection: "online",
      token: { status: "valid", expiresIn: "23h" },
      config: { status: "loaded", source: "storage", lastSyncAt: null },
      loggingMode: "sqlite",
      version: "1.19.0",
      latencyMs: 12,
    },
    health: { state: "HEALTHY", details: [] },
    opfsStatus: { sessionId: "test-session", dirExists: true, files: [], healthy: true },
    injections: { scriptIds: ["s1"], timestamp: "2026-03-18T00:00:00Z", projectId: "proj-1" },
    scripts: [
      { id: "s1", name: "macro-looping.js", order: 1, isEnabled: true, runAt: "document_idle" },
    ],
    loading: false,
    debugMode: false,
    refresh: vi.fn(),
    setActiveProject: vi.fn(),
    toggleScript: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-popup-actions", () => ({
  usePopupActions: () => ({
    logsLoading: false,
    exportLoading: false,
    dbExportLoading: false,
    dbImportLoading: false,
    previewLoading: false,
    importPreview: null,
    importPreviewOpen: false,
    setImportPreviewOpen: vi.fn(),
    importMode: { current: "replace" as const },
    handleViewLogs: vi.fn(),
    handleExport: vi.fn(),
    handleDbExport: vi.fn(),
    handleDbImport: vi.fn(),
    handleConfirmImport: vi.fn(),
    handleCancelImport: vi.fn(),
  }),
}));

vi.mock("@/lib/message-client", () => ({
  sendMessage: vi.fn().mockResolvedValue({}),
}));



import PopupPage from "@/pages/Popup";

describe("Popup Page — Structural Snapshot", () => {
  it("matches the baseline snapshot", () => {
    const { container } = render(<PopupPage />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});
