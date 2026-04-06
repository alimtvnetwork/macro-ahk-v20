/**
 * Marco Extension — Keepalive Alarm
 *
 * Periodic alarm that flushes dirty databases, auto-prunes storage,
 * and persists transient state every 30 seconds.
 */

import { initDatabases } from "./db-manager";
import { checkAndAutoPrune } from "./storage-auto-pruner";
import { saveTransientState } from "./state-manager";
import { isInitialized } from "./message-buffer";
import { logCaughtError, BgLogTag} from "./bg-logger";

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const KEEPALIVE_ALARM = "marco-keepalive";

/* ------------------------------------------------------------------ */
/*  Setup                                                              */
/* ------------------------------------------------------------------ */

/** Registers the keepalive alarm and its tick handler. */
export function registerKeepalive(): void {
    chrome.alarms.create(KEEPALIVE_ALARM, { periodInMinutes: 0.5 });

    chrome.alarms.onAlarm.addListener((alarm) => {
        const isKeepalive = alarm.name === KEEPALIVE_ALARM;
        const isReady = isInitialized();
        const shouldTick = isKeepalive && isReady;

        if (shouldTick) {
            void handleKeepaliveTick();
        }
    });
}

/* ------------------------------------------------------------------ */
/*  Tick Handler                                                       */
/* ------------------------------------------------------------------ */

/** Flushes dirty databases, auto-prunes, and saves transient state. */
async function handleKeepaliveTick(): Promise<void> {
    try {
        const manager = await initDatabases();

        await manager.flushIfDirty();
        await checkAndAutoPrune();
        await saveTransientState();
    } catch (tickError) {
        logCaughtError(BgLogTag.KEEPALIVE, "Keepalive tick skipped", tickError);
    }
}
