/**
 * Marco Extension — Injection Diagnostics
 *
 * Persists background-only injection diagnostics into the extension log store
 * and can mirror important warnings into the active tab console for popup runs.
 */

import { MessageType, type MessageRequest } from "../shared/messages";
import { handleLogEntry, handleLogError } from "./handlers/logging-handler";

export interface InjectionDiagnosticContext {
    configId?: string;
    projectId?: string;
    scriptId?: string;
}

/** Persists an informational injection log entry. */
export async function persistInjectionInfo(
    action: string,
    detail: string,
    context: InjectionDiagnosticContext = {},
): Promise<void> {
    await persistLogEntry("INFO", action, detail, context);
}

/** Persists a warning-level injection log entry. */
export async function persistInjectionWarn(
    action: string,
    detail: string,
    context: InjectionDiagnosticContext = {},
): Promise<void> {
    await persistLogEntry("WARN", action, detail, context);
}

async function persistLogEntry(
    level: "INFO" | "WARN",
    action: string,
    detail: string,
    context: InjectionDiagnosticContext,
): Promise<void> {
    try {
        await handleLogEntry({
            type: MessageType.LOG_ENTRY,
            level,
            source: "background",
            category: "INJECTION",
            action,
            detail,
            scriptId: context.scriptId,
            projectId: context.projectId,
            configId: context.configId,
        } as MessageRequest);
    } catch {
        // Diagnostics must never break injection paths.
    }
}

/** Persists an injection error entry. */
export async function persistInjectionError(
    errorCode: string,
    message: string,
    context: InjectionDiagnosticContext & {
        contextDetail?: string;
        scriptFile?: string;
        stackTrace?: string;
    } = {},
): Promise<void> {
    try {
        await handleLogError({
            type: MessageType.LOG_ERROR,
            level: "ERROR",
            source: "background",
            category: "INJECTION",
            errorCode,
            message,
            stackTrace: context.stackTrace,
            context: context.contextDetail,
            scriptId: context.scriptId,
            projectId: context.projectId,
            configId: context.configId,
            scriptFile: context.scriptFile,
        } as MessageRequest);
    } catch {
        // Diagnostics must never break injection paths.
    }
}

/** Mirrors a diagnostic message into the active tab console. */
export async function mirrorDiagnosticToTab(
    tabId: number,
    message: string,
    level: "log" | "warn" | "error" = "warn",
): Promise<void> {
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            func: (detail: string, entryLevel: "log" | "warn" | "error") => {
                if (entryLevel === "error") {
                    console.error(detail);
                    return;
                }
                if (entryLevel === "warn") {
                    console.warn(detail);
                    return;
                }
                console.log(detail);
            },
            args: [message, level],
        });
    } catch {
        // Tab console mirroring is best-effort only.
    }
}

/**
 * Mirrors multiple log lines to the tab console in a single executeScript call,
 * wrapped in a color-coded console.group for cleaner DevTools output.
 *
 * Lines with level "__group__" or "__groupEnd__" create nested sub-groups.
 */
// eslint-disable-next-line max-lines-per-function
export async function mirrorPipelineLogsToTab(
    tabId: number,
    lines: Array<{ msg: string; level: "log" | "warn" | "error" | "__group__" | "__groupEnd__" }>,
    groupTitle?: string,
): Promise<void> {
    if (lines.length === 0) return;
    try {
        await chrome.scripting.executeScript({
            target: { tabId },
            world: "MAIN",
            func: (
                entries: Array<{ msg: string; level: string }>,
                title: string | undefined,
            // eslint-disable-next-line sonarjs/cognitive-complexity
            ) => {
                const realEntries = entries.filter((e) => e.level !== "__group__" && e.level !== "__groupEnd__");
                const hasErrors = realEntries.some((e) => e.level === "error");
                const hasWarns = realEntries.some((e) => e.level === "warn");

                const groupColor = hasErrors
                    ? "color:#ff6b6b;font-weight:bold"
                    : hasWarns
                        ? "color:#ffa94d;font-weight:bold"
                        : "color:#51cf66;font-weight:bold";

                const label = title ?? "[Marco] Injection Pipeline";
                console.groupCollapsed(`%c${label}`, groupColor);

                for (const entry of entries) {
                    if (entry.level === "__group__") {
                        console.groupCollapsed(`%c${entry.msg}`, "color:#74c0fc;font-weight:bold");
                        continue;
                    }
                    if (entry.level === "__groupEnd__") {
                        console.groupEnd();
                        continue;
                    }

                    const lineColor =
                        entry.level === "error" ? "color:#ff6b6b"
                            : entry.level === "warn" ? "color:#ffa94d"
                                : "color:#adb5bd";

                    if (entry.level === "error") console.error(`%c${entry.msg}`, lineColor);
                    else if (entry.level === "warn") console.warn(`%c${entry.msg}`, lineColor);
                    else console.log(`%c${entry.msg}`, lineColor);
                }

                console.groupEnd();
            },
            args: [lines, groupTitle],
        });
    } catch {
        // Best-effort only.
    }
}