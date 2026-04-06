/**
 * Smoke test — DiagnosticsPanel
 *
 * Verifies the diagnostics panel renders status grid and controls.
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { DiagnosticsPanel } from "@/options/sections/DiagnosticsPanel";


describe("DiagnosticsPanel", () => {
    it("renders without crashing", () => {
        const { container } = render(<DiagnosticsPanel />);
        expect(container).toBeTruthy();
    });

    it("renders the section header", () => {
        render(<DiagnosticsPanel />);
        expect(screen.getByText("🩺 Diagnostics")).toBeInTheDocument();
    });

    it("renders section description", () => {
        render(<DiagnosticsPanel />);
        expect(screen.getByText(/Service worker boot status/)).toBeInTheDocument();
    });

    it("renders diagnostic cards after data loads", async () => {
        render(<DiagnosticsPanel />);
        await waitFor(() => {
            expect(screen.getByText("Boot Phase")).toBeInTheDocument();
            expect(screen.getByText("DB Mode")).toBeInTheDocument();
            expect(screen.getByText("Total Boot Time")).toBeInTheDocument();
            expect(screen.getByText("Version")).toBeInTheDocument();
        });
    });

    it("renders boot step timings section after data loads", async () => {
        render(<DiagnosticsPanel />);
        await waitFor(() => {
            expect(screen.getByText("Boot Step Timings")).toBeInTheDocument();
        });
    });

    it("renders runtime info section after data loads", async () => {
        render(<DiagnosticsPanel />);
        await waitFor(() => {
            expect(screen.getByText("Runtime Info")).toBeInTheDocument();
        });
    });

    it("renders action buttons after data loads", async () => {
        render(<DiagnosticsPanel />);
        await waitFor(() => {
            expect(screen.getByText("↻ Refresh")).toBeInTheDocument();
            expect(screen.getByText("📋 Copy Diagnostics Report")).toBeInTheDocument();
        });
    });

    it("renders auto-refresh indicator", async () => {
        render(<DiagnosticsPanel />);
        await waitFor(() => {
            expect(screen.getByText(/Auto-refresh/)).toBeInTheDocument();
        });
    });
});
