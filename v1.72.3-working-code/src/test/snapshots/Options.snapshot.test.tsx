/**
 * Options Page — Structural Snapshot Test
 *
 * Catches unintended UI drift across web and Chrome extension environments.
 * If the snapshot changes, review the diff and update with `vitest -u`.
 */

import { describe, it, expect, vi } from "vitest";
import { render } from "@testing-library/react";

/* ── Mock hooks before importing the component ──────────────────── */

vi.mock("@/hooks/use-projects-scripts", () => ({
  useProjects: () => ({
    projects: [
      {
        id: "proj-1",
        schemaVersion: 1,
        name: "Lovable Dashboard",
        version: "1.2.0",
        description: "Automation scripts for the Lovable dashboard",
        targetUrls: [{ pattern: "lovable.dev/*", matchType: "glob" }],
        scripts: [{ path: "macro-looping.js", order: 1 }],
        configs: [],
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-03-18T00:00:00Z",
      },
    ],
    loading: false,
    refresh: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  }),
  useScripts: () => ({
    scripts: [
      { id: "s1", name: "macro-looping.js", code: "", order: 1, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-03-18T00:00:00Z" },
    ],
    loading: false,
    refresh: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  }),
  useConfigs: () => ({
    configs: [],
    loading: false,
    refresh: vi.fn(),
    save: vi.fn(),
    remove: vi.fn(),
  }),
}));

vi.mock("@/hooks/use-onboarding", () => ({
  useOnboarding: () => ({
    isComplete: true,
    loading: false,
    completeOnboarding: vi.fn(),
  }),
}));

vi.mock("@/lib/message-client", () => ({
  sendMessage: vi.fn().mockResolvedValue({}),
}));

vi.mock("@/platform", () => ({
  getPlatform: () => ({
    sendMessage: vi.fn().mockResolvedValue({}),
    tabs: { openUrl: vi.fn(), getActiveTabId: vi.fn().mockResolvedValue(1) },
    getExtensionUrl: (p: string) => p,
    storage: { get: vi.fn(), set: vi.fn() },
  }),
}));



import OptionsPage from "@/pages/Options";

describe("Options Page — Structural Snapshot", () => {
  it("matches the baseline snapshot", () => {
    const { container } = render(<OptionsPage />);
    expect(container.innerHTML).toMatchSnapshot();
  });
});
