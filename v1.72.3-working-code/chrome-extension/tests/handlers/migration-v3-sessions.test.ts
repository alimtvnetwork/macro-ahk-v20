/**
 * Unit tests — v3 Migration: Sessions TEXT PK → INTEGER AUTOINCREMENT PK
 *
 * Verifies that migrateSessionsToIntegerPk correctly:
 * 1. Converts TEXT PK to INTEGER AUTOINCREMENT PK
 * 2. Preserves session data (columns copied correctly)
 * 3. Remaps Logs.session_id foreign keys to new integer IDs
 * 4. Detection helper sessionsHasTextPk works correctly
 */

import { describe, it, expect, beforeEach } from "vitest";
import initSqlJs, { type Database } from "sql.js";

const { sessionsHasTextPk, migrateSessionsToIntegerPk } = await import(
    "../../src/background/migration-v3-sql"
);

let SQL: Awaited<ReturnType<typeof initSqlJs>>;
let db: Database;

/** Legacy schema with TEXT PK Sessions and snake_case columns. */
const LEGACY_SCHEMA = `
CREATE TABLE Sessions (
    id         TEXT PRIMARY KEY,
    started_at TEXT NOT NULL,
    ended_at   TEXT,
    version    TEXT NOT NULL,
    user_agent TEXT,
    notes      TEXT
);
CREATE TABLE Logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT NOT NULL,
    timestamp  TEXT NOT NULL,
    level      TEXT NOT NULL,
    source     TEXT NOT NULL,
    category   TEXT NOT NULL,
    action     TEXT NOT NULL,
    detail     TEXT
);
`;

beforeEach(async () => {
    if (!SQL) SQL = await initSqlJs();
    db = new SQL.Database();
    db.run(LEGACY_SCHEMA);
});

/* ------------------------------------------------------------------ */
/*  Detection                                                          */
/* ------------------------------------------------------------------ */

describe("sessionsHasTextPk", () => {
    it("returns true for TEXT PK Sessions", () => {
        expect(sessionsHasTextPk(db)).toBe(true);
    });

    it("returns false after migration to INTEGER PK", () => {
        migrateSessionsToIntegerPk(db);
        expect(sessionsHasTextPk(db)).toBe(false);
    });

    it("returns false when Sessions table does not exist", () => {
        const emptyDb = new SQL.Database();
        expect(sessionsHasTextPk(emptyDb)).toBe(false);
        emptyDb.close();
    });
});

/* ------------------------------------------------------------------ */
/*  Migration — empty tables                                           */
/* ------------------------------------------------------------------ */

describe("migrateSessionsToIntegerPk — empty tables", () => {
    it("completes without error on empty Sessions", () => {
        expect(() => migrateSessionsToIntegerPk(db)).not.toThrow();
    });

    it("creates new Sessions table with INTEGER PK", () => {
        migrateSessionsToIntegerPk(db);

        const info = db.exec("PRAGMA table_info(Sessions)");
        const cols = info[0].columns;
        const nameIdx = cols.indexOf("name");
        const typeIdx = cols.indexOf("type");

        const idRow = info[0].values.find((r) => r[nameIdx] === "Id");
        expect(idRow).toBeDefined();
        expect(String(idRow![typeIdx]).toUpperCase()).toBe("INTEGER");
    });

    it("drops Sessions_old after migration", () => {
        migrateSessionsToIntegerPk(db);

        const tables = db.exec(
            "SELECT name FROM sqlite_master WHERE type='table' AND name='Sessions_old'",
        );
        expect(tables).toHaveLength(0);
    });
});

/* ------------------------------------------------------------------ */
/*  Migration — data preservation                                      */
/* ------------------------------------------------------------------ */

describe("migrateSessionsToIntegerPk — data preservation", () => {
    beforeEach(() => {
        // Seed 3 sessions with TEXT UUIDs
        db.run(
            "INSERT INTO Sessions (id, started_at, ended_at, version, user_agent, notes) VALUES (?, ?, ?, ?, ?, ?)",
            ["uuid-aaa", "2026-01-01T00:00:00Z", "2026-01-01T01:00:00Z", "1.0.0", "Chrome/120", "first session"],
        );
        db.run(
            "INSERT INTO Sessions (id, started_at, ended_at, version, user_agent, notes) VALUES (?, ?, ?, ?, ?, ?)",
            ["uuid-bbb", "2026-01-02T00:00:00Z", null, "1.0.1", "Firefox/115", null],
        );
        db.run(
            "INSERT INTO Sessions (id, started_at, ended_at, version, user_agent, notes) VALUES (?, ?, ?, ?, ?, ?)",
            ["uuid-ccc", "2026-01-03T00:00:00Z", "2026-01-03T02:00:00Z", "1.1.0", null, "third"],
        );
    });

    it("preserves all session rows", () => {
        migrateSessionsToIntegerPk(db);

        const count = db.exec("SELECT COUNT(*) FROM Sessions");
        expect(count[0].values[0][0]).toBe(3);
    });

    it("assigns sequential INTEGER IDs", () => {
        migrateSessionsToIntegerPk(db);

        const ids = db.exec("SELECT Id FROM Sessions ORDER BY Id");
        const idValues = ids[0].values.map((r) => r[0]);
        expect(idValues).toEqual([1, 2, 3]);
    });

    it("preserves column data (StartedAt, EndedAt, Version, UserAgent, Notes)", () => {
        migrateSessionsToIntegerPk(db);

        const rows = db.exec("SELECT StartedAt, EndedAt, Version, UserAgent, Notes FROM Sessions ORDER BY Id");
        const vals = rows[0].values;

        // Session 1
        expect(vals[0][0]).toBe("2026-01-01T00:00:00Z");
        expect(vals[0][1]).toBe("2026-01-01T01:00:00Z");
        expect(vals[0][2]).toBe("1.0.0");
        expect(vals[0][3]).toBe("Chrome/120");
        expect(vals[0][4]).toBe("first session");

        // Session 2 — null EndedAt and Notes
        expect(vals[1][0]).toBe("2026-01-02T00:00:00Z");
        expect(vals[1][1]).toBeNull();
        expect(vals[1][2]).toBe("1.0.1");
        expect(vals[1][3]).toBe("Firefox/115");
        expect(vals[1][4]).toBeNull();

        // Session 3 — null UserAgent
        expect(vals[2][3]).toBeNull();
        expect(vals[2][4]).toBe("third");
    });
});

/* ------------------------------------------------------------------ */
/*  Migration — Logs session_id remapping                              */
/* ------------------------------------------------------------------ */

describe("migrateSessionsToIntegerPk — Logs FK remapping", () => {
    beforeEach(() => {
        // 2 sessions
        db.run(
            "INSERT INTO Sessions (id, started_at, version) VALUES (?, ?, ?)",
            ["uuid-aaa", "2026-01-01T00:00:00Z", "1.0.0"],
        );
        db.run(
            "INSERT INTO Sessions (id, started_at, version) VALUES (?, ?, ?)",
            ["uuid-bbb", "2026-01-02T00:00:00Z", "1.0.1"],
        );

        // 5 log rows: 3 for uuid-aaa, 2 for uuid-bbb
        for (let i = 0; i < 3; i++) {
            db.run(
                "INSERT INTO Logs (session_id, timestamp, level, source, category, action) VALUES (?, ?, ?, ?, ?, ?)",
                ["uuid-aaa", `2026-01-01T00:0${i}:00Z`, "INFO", "bg", "TEST", `a-${i}`],
            );
        }
        for (let i = 0; i < 2; i++) {
            db.run(
                "INSERT INTO Logs (session_id, timestamp, level, source, category, action) VALUES (?, ?, ?, ?, ?, ?)",
                ["uuid-bbb", `2026-01-02T00:0${i}:00Z`, "WARN", "cs", "API", `b-${i}`],
            );
        }
    });

    it("remaps all Logs.session_id from TEXT UUIDs to new INTEGER IDs", () => {
        migrateSessionsToIntegerPk(db);

        // uuid-aaa → 1, uuid-bbb → 2 (ordered by started_at)
        const logsForSession1 = db.exec("SELECT COUNT(*) FROM Logs WHERE session_id = 1");
        expect(logsForSession1[0].values[0][0]).toBe(3);

        const logsForSession2 = db.exec("SELECT COUNT(*) FROM Logs WHERE session_id = 2");
        expect(logsForSession2[0].values[0][0]).toBe(2);
    });

    it("leaves no orphaned TEXT session_id references", () => {
        migrateSessionsToIntegerPk(db);

        const orphans = db.exec(
            "SELECT COUNT(*) FROM Logs WHERE TYPEOF(session_id) = 'text' AND session_id NOT GLOB '[0-9]*'",
        );
        expect(orphans[0].values[0][0]).toBe(0);
    });

    it("preserves total log count", () => {
        migrateSessionsToIntegerPk(db);

        const count = db.exec("SELECT COUNT(*) FROM Logs");
        expect(count[0].values[0][0]).toBe(5);
    });

    it("preserves log row data after remapping", () => {
        migrateSessionsToIntegerPk(db);

        const rows = db.exec("SELECT action, level FROM Logs WHERE session_id = 1 ORDER BY action");
        expect(rows[0].values.map((r) => r[0])).toEqual(["a-0", "a-1", "a-2"]);
        expect(rows[0].values[0][1]).toBe("INFO");

        const rows2 = db.exec("SELECT action, level FROM Logs WHERE session_id = 2 ORDER BY action");
        expect(rows2[0].values.map((r) => r[0])).toEqual(["b-0", "b-1"]);
        expect(rows2[0].values[0][1]).toBe("WARN");
    });
});
