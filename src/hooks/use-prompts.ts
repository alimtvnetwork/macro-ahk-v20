/**
 * React hook for T-10/T-11 Prompt CRUD with categories & favorites.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { sendMessage } from "@/lib/message-client";

export interface PromptEntry {
    id: string;
    slug?: string;
    name: string;
    text: string;
    order: number;
    isDefault?: boolean;
    category?: string;
    isFavorite?: boolean;
    createdAt: string;
    updatedAt: string;
}

interface GetPromptsResponse {
    prompts?: PromptEntry[];
}

function isRecord(value: PromptEntry | Record<string, unknown>): value is Record<string, unknown> {
    return typeof value === "object" && value !== null;
}

function toError(error: Error | string | null, fallback: string): Error {
    return error instanceof Error ? error : new Error(fallback);
}

function normalizePrompt(raw: PromptEntry | Record<string, unknown>, index: number): PromptEntry {
    if (!isRecord(raw)) {
        throw new Error(`[Prompts] Invalid prompt at index ${index}: expected object`);
    }

    const id = raw.id != null ? String(raw.id) : String(index);
    const name = typeof raw.name === "string" ? raw.name.trim() : "";
    const text = typeof raw.text === "string" ? raw.text : "";

    if (name === "") {
        throw new Error(`[Prompts] Invalid prompt ${id}: "name" must be a non-empty string`);
    }

    const order = typeof raw.order === "number" && Number.isFinite(raw.order) ? raw.order : index;

    return {
        id,
        name,
        text,
        order,
        isDefault: raw.isDefault === true,
        isFavorite: raw.isFavorite === true,
        category: typeof raw.category === "string" && raw.category.trim() !== "" ? raw.category.trim() : undefined,
        createdAt: typeof raw.createdAt === "string" ? raw.createdAt : new Date().toISOString(),
        updatedAt: typeof raw.updatedAt === "string" ? raw.updatedAt : new Date().toISOString(),
    };
}

// eslint-disable-next-line max-lines-per-function
export function usePrompts() {
    const [prompts, setPrompts] = useState<PromptEntry[]>([]);
    const [loading, setLoading] = useState(true);
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [fatalError, setFatalError] = useState<Error | null>(null);

    const refresh = useCallback(async () => {
        setLoading(true);
        setFatalError(null);

        try {
            const result = await sendMessage<GetPromptsResponse>({ type: "GET_PROMPTS" });
            const rawList = Array.isArray(result.prompts) ? result.prompts : [];
            const normalized = rawList.map((entry, index) => normalizePrompt(entry, index));
            setPrompts(normalized);
        } catch (error) {
            setPrompts([]);
            setFatalError(toError(error, "Failed to load prompts"));
        } finally {
            setLoading(false);
        }
    }, []);

    const save = useCallback(async (prompt: Partial<PromptEntry>) => {
        await sendMessage({ type: "SAVE_PROMPT", prompt });
        await refresh();
    }, [refresh]);

    const remove = useCallback(async (promptId: string) => {
        await sendMessage({ type: "DELETE_PROMPT", promptId });
        await refresh();
    }, [refresh]);

    const reorder = useCallback(async (promptIds: string[]) => {
        await sendMessage({ type: "REORDER_PROMPTS", promptIds });
        await refresh();
    }, [refresh]);

    const reseedDefaults = useCallback(async () => {
        await sendMessage({ type: "RESEED_PROMPTS" });
        await refresh();
    }, [refresh]);

    const toggleFavorite = useCallback(async (promptId: string) => {
        const target = prompts.find((prompt) => prompt.id === promptId);
        if (!target) return;
        await save({ ...target, isFavorite: !target.isFavorite });
    }, [prompts, save]);

    // Derive categories
    const categories = useMemo(() => {
        const categorySet = new Set<string>();
        prompts.forEach((prompt) => {
            if (prompt.category) {
                categorySet.add(prompt.category);
            }
        });
        return Array.from(categorySet).sort();
    }, [prompts]);

    // Filtered + sorted: favorites pinned to top
    const filtered = useMemo(() => {
        const filteredPrompts = categoryFilter === "all"
            ? prompts
            : prompts.filter((prompt) => prompt.category === categoryFilter);

        return [...filteredPrompts].sort((a, b) => {
            const aFavorite = a.isFavorite ? 1 : 0;
            const bFavorite = b.isFavorite ? 1 : 0;
            if (aFavorite !== bFavorite) {
                return bFavorite - aFavorite;
            }
            return a.order - b.order;
        });
    }, [prompts, categoryFilter]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    return {
        prompts: filtered,
        allPrompts: prompts,
        categories,
        categoryFilter,
        setCategoryFilter,
        loading,
        fatalError,
        refresh,
        save,
        remove,
        reorder,
        reseedDefaults,
        toggleFavorite,
    };
}
