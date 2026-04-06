import { describe, it, expect, vi } from "vitest";

/**
 * The module's internal functions (buildManifest, formatScript, parseVariables,
 * buildFilename) are not exported. We test them indirectly through exportProject,
 * which is the only public API.
 *
 * We mock the DOM download trigger and inspect the JSON that would be written.
 */

// Capture what exportProject tries to download
let downloadedContent = "";
let downloadedFilename = "";

vi.stubGlobal("URL", {
  createObjectURL: () => "blob://fake",
  revokeObjectURL: () => {},
});

// Mock anchor click
const clickSpy = vi.fn();
vi.spyOn(document, "createElement").mockImplementation((tag: string) => {
  if (tag === "a") {
    return {
      set href(_: string) {},
      set download(name: string) {
        downloadedFilename = name;
      },
      click: clickSpy,
    } as unknown as HTMLElement;
  }
  return document.createElement(tag);
});

// Mock Blob to capture content
vi.stubGlobal(
  "Blob",
  class FakeBlob {
    content: string;
    constructor(parts: string[]) {
      this.content = parts.join("");
      downloadedContent = this.content;
    }
  },
);

// Must import after mocks are set up
const { exportProject } = await import("../project-exporter");

function makeProject(overrides: Record<string, unknown> = {}) {
  return {
    id: "test-1",
    schemaVersion: 1,
    name: "Test Project",
    version: "1.0.0",
    targetUrls: [{ pattern: "https://example.com/*", matchType: "glob" }],
    scripts: [
      { path: "scripts/main.js", order: 1, runAt: "document_idle" },
    ],
    createdAt: "2026-01-01",
    updatedAt: "2026-01-01",
    ...overrides,
  } as any;
}

function getManifest(): Record<string, unknown> {
  return JSON.parse(downloadedContent);
}

describe("exportProject", () => {
  it("includes name, version, targetUrls, and scripts", () => {
    exportProject(makeProject());
    const manifest = getManifest();

    expect(manifest.name).toBe("Test Project");
    expect(manifest.version).toBe("1.0.0");
    expect(manifest.targetUrls).toEqual([
      { pattern: "https://example.com/*", matchType: "glob" },
    ]);
    expect(manifest.scripts).toEqual([
      { path: "scripts/main.js", order: 1, runAt: "document_idle" },
    ]);
  });

  it("includes description when present", () => {
    exportProject(makeProject({ description: "My automation" }));
    const manifest = getManifest();

    expect(manifest.description).toBe("My automation");
  });

  it("omits description when absent", () => {
    exportProject(makeProject());
    const manifest = getManifest();

    expect(manifest).not.toHaveProperty("description");
  });

  it("includes variables when present and non-empty", () => {
    const variables = JSON.stringify({ apiUrl: "https://api.test.com", retries: 3 });
    exportProject(makeProject({ variables }));
    const manifest = getManifest();

    expect(manifest.variables).toEqual({ apiUrl: "https://api.test.com", retries: 3 });
  });

  it("omits variables when empty object string", () => {
    exportProject(makeProject({ variables: "{}" }));
    const manifest = getManifest();

    expect(manifest).not.toHaveProperty("variables");
  });

  it("omits variables when invalid JSON", () => {
    exportProject(makeProject({ variables: "not-json" }));
    const manifest = getManifest();

    expect(manifest).not.toHaveProperty("variables");
  });

  it("includes configBinding on scripts that have one", () => {
    const scripts = [
      { path: "scripts/a.js", order: 1, configBinding: "configs/a.json" },
      { path: "scripts/b.js", order: 2 },
    ];
    exportProject(makeProject({ scripts }));
    const manifest = getManifest();
    const exported = manifest.scripts as any[];

    expect(exported[0].configBinding).toBe("configs/a.json");
    expect(exported[1]).not.toHaveProperty("configBinding");
  });

  it("defaults runAt to document_idle when not specified", () => {
    const scripts = [{ path: "scripts/x.js", order: 1 }];
    exportProject(makeProject({ scripts }));
    const manifest = getManifest();

    expect((manifest.scripts as any[])[0].runAt).toBe("document_idle");
  });

  it("preserves multiple URL rules", () => {
    const targetUrls = [
      { pattern: "https://a.com/*", matchType: "glob" },
      { pattern: "https://b.com/page", matchType: "exact" },
      { pattern: "https://.*\\.c\\.com", matchType: "regex" },
    ];
    exportProject(makeProject({ targetUrls }));
    const manifest = getManifest();

    expect(manifest.targetUrls).toEqual(targetUrls);
  });

  it("generates correct filename slug", () => {
    exportProject(makeProject({ name: "My Cool Project" }));

    expect(downloadedFilename).toBe("marco-my-cool-project.json");
  });

  it("triggers a download", () => {
    exportProject(makeProject());

    expect(clickSpy).toHaveBeenCalled();
  });
});
