/**
 * React hook for T-12 Prompt Chain CRUD & execution.
 * Chains saved in chrome.storage.sync (or localStorage in preview).
 */

import { useEffect, useState, useCallback } from "react";
import { sendMessage } from "@/lib/message-client";
import type { PromptEntry } from "./use-prompts";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface PromptChain {
    id: string;
    /** Ordered list of prompt IDs in this chain. */
    promptIds: string[];
    name: string;
    /** Max seconds to wait for idle between prompts (default 300 = 5 min). */
    timeoutSec: number;
    /** Whether to auto-submit after injecting each prompt (default true). */
    autoSubmit: boolean;
    /** Delay in ms between injection and auto-submit (default 200). */
    submitDelayMs: number;
    createdAt: string;
    updatedAt: string;
}

export type ChainStepStatus = "pending" | "running" | "done" | "error" | "skipped";

export interface ChainExecutionState {
    chainId: string;
    currentStep: number;
    totalSteps: number;
    stepStatuses: ChainStepStatus[];
    isRunning: boolean;
    error?: string;
}

interface GetPromptChainsResponse {
    chains?: PromptChain[];
}

const MAX_CHAIN_LENGTH = 10;
const DEFAULT_TIMEOUT_SEC = 300;

function isRecord(value: PromptChain | Record<string, unknown>): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function toError(error: Error | string | null, fallback: string): Error {
    return error instanceof Error ? error : new Error(fallback);
}

function normalizeChain(raw: PromptChain | Record<string, unknown>, index: number): PromptChain {
    if (!isRecord(raw)) {
        throw new Error(`[PromptChains] Invalid chain at index ${index}: expected object`);
    }

    const id = typeof raw.id === "string" && raw.id.trim() !== "" ? raw.id : crypto.randomUUID();
    const name = typeof raw.name === "string" && raw.name.trim() !== "" ? raw.name.trim() : `Chain ${index + 1}`;
    const promptIdsRaw = Array.isArray(raw.promptIds) ? raw.promptIds : [];
    const promptIds = promptIdsRaw.filter((idValue): idValue is string => typeof idValue === "string" && idValue.trim() !== "").slice(0, MAX_CHAIN_LENGTH);

    return {
        id,
        name,
        promptIds,
        timeoutSec: typeof raw.timeoutSec === "number" && Number.isFinite(raw.timeoutSec)
            ? raw.timeoutSec
            : DEFAULT_TIMEOUT_SEC,
        autoSubmit: typeof raw.autoSubmit === "boolean" ? raw.autoSubmit : true,
        submitDelayMs: typeof raw.submitDelayMs === "number" && Number.isFinite(raw.submitDelayMs) ? raw.submitDelayMs : 200,
        createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    };
}

/* ------------------------------------------------------------------ */
/*  Hook                                                               */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
export function usePromptChains() {
    const [chains, setChains] = useState<PromptChain[]>([]);
    const [loading, setLoading] = useState(true);
    const [execution, setExecution] = useState<ChainExecutionState | null>(null);
    const [fatalError, setFatalError] = useState<Error | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setFatalError(null);

        try {
            const result = await sendMessage<GetPromptChainsResponse>({ type: "GET_PROMPT_CHAINS" });
            const rawList = Array.isArray(result.chains) ? result.chains : [];
            const normalized = rawList.map((entry, index) => normalizeChain(entry, index));
            setChains(normalized);
        } catch (error) {
            setChains([]);
            setFatalError(toError(error, "Failed to load prompt chains"));
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const save = useCallback(async (chain: Partial<PromptChain>) => {
        const now = new Date().toISOString();
        const normalizedChain: PromptChain = {
            id: chain.id ?? crypto.randomUUID(),
            name: chain.name?.trim() || "Untitled Chain",
            promptIds: (chain.promptIds ?? []).slice(0, MAX_CHAIN_LENGTH),
            timeoutSec: chain.timeoutSec ?? DEFAULT_TIMEOUT_SEC,
            autoSubmit: chain.autoSubmit ?? true,
            submitDelayMs: chain.submitDelayMs ?? 200,
            createdAt: chain.createdAt ?? now,
            updatedAt: now,
        };

        await sendMessage({ type: "SAVE_PROMPT_CHAIN", chain: normalizedChain });
        await refresh();
    }, [refresh]);

    const remove = useCallback(async (chainId: string) => {
        await sendMessage({ type: "DELETE_PROMPT_CHAIN", chainId });
        await refresh();
    }, [refresh]);

    /**
     * Execute a chain: inject prompts sequentially, waiting for idle between each.
     * In preview mode this simulates with timeouts.
     */
    // eslint-disable-next-line max-lines-per-function
    const execute = useCallback(async (chain: PromptChain, prompts: PromptEntry[]) => {
        const orderedPrompts = chain.promptIds
            .map((id) => prompts.find((prompt) => prompt.id === id))
            .filter((prompt): prompt is PromptEntry => prompt !== undefined);

        if (orderedPrompts.length === 0) {
            throw new Error(`Chain "${chain.name}" has no valid prompt steps to execute.`);
        }

        const state: ChainExecutionState = {
            chainId: chain.id,
            currentStep: 0,
            totalSteps: orderedPrompts.length,
            stepStatuses: orderedPrompts.map((): ChainStepStatus => "pending"),
            isRunning: true,
        };
        setExecution({ ...state });

        for (let stepIndex = 0; stepIndex < orderedPrompts.length; stepIndex += 1) {
            state.currentStep = stepIndex;
            state.stepStatuses[stepIndex] = "running";
            setExecution({ ...state });

            try {
                await sendMessage({
                    type: "EXECUTE_CHAIN_STEP",
                    promptText: orderedPrompts[stepIndex].text,
                    stepIndex,
                    totalSteps: orderedPrompts.length,
                    timeoutSec: chain.timeoutSec,
                });

                state.stepStatuses[stepIndex] = "done";
                setExecution({ ...state });
            } catch (error) {
                state.stepStatuses[stepIndex] = "error";
                state.error = error instanceof Error ? error.message : "Chain step failed";

                for (let remaining = stepIndex + 1; remaining < orderedPrompts.length; remaining += 1) {
                    state.stepStatuses[remaining] = "skipped";
                }

                state.isRunning = false;
                setExecution({ ...state });
                return;
            }
        }

        state.isRunning = false;
        setExecution({ ...state });
    }, []);

    const stopExecution = useCallback(() => {
        setExecution((previous) => {
            if (!previous) return null;

            return {
                ...previous,
                isRunning: false,
                stepStatuses: previous.stepStatuses.map((status) =>
                    status === "pending" || status === "running" ? "skipped" : status,
                ),
            };
        });
    }, []);

    const clearExecution = useCallback(() => {
        setExecution(null);
    }, []);

    return {
        chains,
        loading,
        fatalError,
        save,
        remove,
        refresh,
        execution,
        execute,
        stopExecution,
        clearExecution,
        MAX_CHAIN_LENGTH,
    };
}
