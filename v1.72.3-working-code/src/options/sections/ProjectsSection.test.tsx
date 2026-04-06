/**
 * Smoke test — ProjectsSection
 *
 * Verifies the projects list renders correctly with mock data.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { ProjectsSection } from "@/options/sections/ProjectsSection";


describe("ProjectsSection", () => {
    it("renders without crashing", () => {
        const { container } = render(<ProjectsSection />);
        expect(container).toBeTruthy();
    });

    it("shows loading state initially", () => {
        render(<ProjectsSection />);
        expect(screen.getByText("Loading projects…")).toBeInTheDocument();
    });

    it("renders project list or empty state after loading", async () => {
        render(<ProjectsSection />);
        await waitFor(() => {
            // After loading, should show either project cards or empty state
            const hasProjects = screen.queryByText("+ New Project") !== null;
            const hasEmptyState = screen.queryByText("No projects yet") !== null;
            expect(hasProjects || hasEmptyState).toBe(true);
        });
    });

    it("renders import/export buttons after loading", async () => {
        render(<ProjectsSection />);
        await waitFor(() => {
            expect(screen.getByText("📂 Import JSON")).toBeInTheDocument();
        });
    });

    it("renders SQLite bundle export button after loading", async () => {
        render(<ProjectsSection />);
        await waitFor(() => {
            expect(screen.getByText("🗄️ Export SQLite Bundle")).toBeInTheDocument();
        });
    });

    it("renders import mode toggle after loading", async () => {
        render(<ProjectsSection />);
        await waitFor(() => {
            expect(screen.getByText("Merge")).toBeInTheDocument();
            expect(screen.getByText("Replace All")).toBeInTheDocument();
        });
    });
});
