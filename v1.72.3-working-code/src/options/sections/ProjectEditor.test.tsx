/**
 * Smoke test — ProjectEditor
 *
 * Verifies the project editor renders form fields and section editors.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProjectEditor } from "@/options/sections/ProjectEditor";


const mockProject = {
    id: "test-project-1",
    schemaVersion: 1,
    name: "Test Project",
    version: "1.0.0",
    description: "A test project",
    targetUrls: [{ pattern: "https://example.com/*", matchType: "glob" }],
    scripts: [{ path: "inject.js", order: 0 }],
    configs: [],
    cookies: [],
    settings: { logLevel: "info" as const, variables: { key1: "value1" } },
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-15T00:00:00.000Z",
};

describe("ProjectEditor", () => {
    const onBack = vi.fn();

    it("renders without crashing for new project", () => {
        const { container } = render(<ProjectEditor project={null} onBack={onBack} />);
        expect(container).toBeTruthy();
    });

    it("shows 'New Project' title for null project", () => {
        render(<ProjectEditor project={null} onBack={onBack} />);
        expect(screen.getByText(/New Project/)).toBeInTheDocument();
    });

    it("shows project name for existing project", () => {
        render(<ProjectEditor project={mockProject} onBack={onBack} />);
        expect(screen.getByText(/Test Project/)).toBeInTheDocument();
    });

    it("renders Name input field", () => {
        render(<ProjectEditor project={mockProject} onBack={onBack} />);
        expect(screen.getByText("Name")).toBeInTheDocument();
        const nameInput = screen.getByDisplayValue("Test Project");
        expect(nameInput).toBeInTheDocument();
    });

    it("renders Description input field", () => {
        render(<ProjectEditor project={mockProject} onBack={onBack} />);
        expect(screen.getByText("Description")).toBeInTheDocument();
        const descInput = screen.getByDisplayValue("A test project");
        expect(descInput).toBeInTheDocument();
    });

    it("renders URL Rules section", () => {
        render(<ProjectEditor project={mockProject} onBack={onBack} />);
        expect(screen.getByText("URL Rules")).toBeInTheDocument();
    });

    it("renders Save and Cancel buttons", () => {
        render(<ProjectEditor project={mockProject} onBack={onBack} />);
        expect(screen.getByText("Save Project")).toBeInTheDocument();
        expect(screen.getByText("Cancel")).toBeInTheDocument();
    });

    it("renders back navigation button", () => {
        render(<ProjectEditor project={mockProject} onBack={onBack} />);
        expect(screen.getByText("← Projects")).toBeInTheDocument();
    });
});
