/**
 * Unit tests — Boot Diagnostics
 *
 * Tests step tracking, timing recording, persistence mode, and finalization.
 */

import { describe, it, expect, beforeEach, vi } from "vitest";

// Boot diagnostics uses module-level state, so we re-import fresh each suite
let bootDiagnostics: typeof import("../../src/background/boot-diagnostics");

beforeEach(async () => {
    vi.resetModules();
    // Stub performance.now for deterministic timing
    let tick = 0;
    vi.spyOn(performance, "now").mockImplementation(() => {
        tick += 100;
        return tick;
    });
    bootDiagnostics = await import("../../src/background/boot-diagnostics");
});

describe("Boot Diagnostics — Step Tracking", () => {
    it("returns pre-init as default step", () => {
        expect(bootDiagnostics.getBootStep()).toBe("pre-init");
    });

    it("updates step via setBootStep", () => {
        bootDiagnostics.setBootStep("db-init");
        expect(bootDiagnostics.getBootStep()).toBe("db-init");
    });

    it("tracks multiple step transitions", () => {
        bootDiagnostics.setBootStep("db-init");
        bootDiagnostics.setBootStep("bind-handlers");
        bootDiagnostics.setBootStep("ready");

        expect(bootDiagnostics.getBootStep()).toBe("ready");
    });
});

describe("Boot Diagnostics — Timing", () => {
    it("records timing for each step after finalizeBoot", () => {
        bootDiagnostics.setBootStep("db-init");
        bootDiagnostics.setBootStep("bind-handlers");
        bootDiagnostics.finalizeBoot();

        const timings = bootDiagnostics.getBootTimings();
        expect(timings.length).toBeGreaterThanOrEqual(2);
        expect(timings[0].step).toBe("pre-init");
        expect(timings[1].step).toBe("db-init");
    });

    it("returns total boot ms after finalization", () => {
        bootDiagnostics.setBootStep("db-init");
        bootDiagnostics.setBootStep("ready");
        bootDiagnostics.finalizeBoot();

        const total = bootDiagnostics.getTotalBootMs();
        expect(total).toBeGreaterThan(0);
    });

    it("returns 0 total before finalization", () => {
        expect(bootDiagnostics.getTotalBootMs()).toBe(0);
    });

    it("returns a copy of timings (not the original array)", () => {
        bootDiagnostics.setBootStep("db-init");
        bootDiagnostics.finalizeBoot();

        const timings1 = bootDiagnostics.getBootTimings();
        const timings2 = bootDiagnostics.getBootTimings();
        expect(timings1).not.toBe(timings2);
        expect(timings1).toEqual(timings2);
    });
});

describe("Boot Diagnostics — Persistence Mode", () => {
    it("defaults to memory", () => {
        expect(bootDiagnostics.getBootPersistenceMode()).toBe("memory");
    });

    it("updates persistence mode to opfs", () => {
        bootDiagnostics.setBootPersistenceMode("opfs");
        expect(bootDiagnostics.getBootPersistenceMode()).toBe("opfs");
    });

    it("updates persistence mode to storage", () => {
        bootDiagnostics.setBootPersistenceMode("storage");
        expect(bootDiagnostics.getBootPersistenceMode()).toBe("storage");
    });
});

describe("Boot Diagnostics — Failed Boot Step", () => {
    it("records failed step label", () => {
        bootDiagnostics.setBootStep("db-init");
        bootDiagnostics.setBootStep("failed:db-init");
        bootDiagnostics.finalizeBoot();

        expect(bootDiagnostics.getBootStep()).toBe("failed:db-init");
        const timings = bootDiagnostics.getBootTimings();
        const lastTiming = timings[timings.length - 1];
        expect(lastTiming.step).toBe("failed:db-init");
    });
});
