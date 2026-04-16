/**
 * Riseup Macro SDK — API Module
 *
 * Auto-generated typed methods from the API registry.
 * Provides `marco.api.<group>.<method>(params?, body?)` calls.
 *
 * Config-driven registry underneath; typed wrappers on top.
 */

import { httpClient } from "./http";
import { apiRegistry, resolveUrl } from "./api-registry";
import type { EndpointConfig } from "./api-registry";
import type { AxiosRequestConfig, AxiosResponse } from "axios";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ApiCallOptions {
    params?: Record<string, string>;
    body?: unknown;
    headers?: Record<string, string>;
    baseUrl?: string;
    timeoutMs?: number;
}

export interface ApiResponse<T = unknown> {
    readonly ok: boolean;
    readonly status: number;
    readonly data: T;
    readonly headers: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/*  Generic caller                                                     */
/* ------------------------------------------------------------------ */

async function callEndpoint<T = unknown>(
    endpoint: EndpointConfig,
    options?: ApiCallOptions,
): Promise<ApiResponse<T>> {
    const baseUrl = options?.baseUrl ?? "";
    const url = baseUrl + resolveUrl(endpoint.url, options?.params);

    const axiosConfig: AxiosRequestConfig = {
        method: endpoint.method,
        url,
        timeout: options?.timeoutMs ?? endpoint.timeoutMs,
        headers: options?.headers,
        validateStatus: () => true, // Never throw on HTTP status — caller decides
    };

    if (options?.body !== undefined) {
        axiosConfig.data = options.body;
    }

    if (!endpoint.auth) {
        (axiosConfig as unknown as Record<string, unknown>).__skipAuth = true;
    }

    const response: AxiosResponse<T> = await httpClient.request<T>(axiosConfig);

    const responseHeaders: Record<string, string> = {};
    for (const key of Object.keys(response.headers)) {
        const val = response.headers[key];
        if (typeof val === "string") {
            responseHeaders[key] = val;
        }
    }

    return {
        ok: response.status >= 200 && response.status < 300,
        status: response.status,
        data: response.data,
        headers: responseHeaders,
    };
}

/* ------------------------------------------------------------------ */
/*  Generic call-by-path (config-driven)                               */
/* ------------------------------------------------------------------ */

function call<T = unknown>(
    path: string,
    options?: ApiCallOptions,
): Promise<ApiResponse<T>> {
    const parts = path.split(".");

    if (parts.length !== 2) {
        return Promise.reject(new Error(`[marco.api] Invalid path "${path}" — expected "group.endpoint"`));
    }

    const group = apiRegistry[parts[0]];

    if (!group) {
        return Promise.reject(new Error(`[marco.api] Unknown group "${parts[0]}"`));
    }

    const endpoint = group[parts[1]];

    if (!endpoint) {
        return Promise.reject(new Error(`[marco.api] Unknown endpoint "${path}"`));
    }

    return callEndpoint<T>(endpoint, options);
}

/* ------------------------------------------------------------------ */
/*  Typed method wrappers                                              */
/* ------------------------------------------------------------------ */

const credits = Object.freeze({
    fetchWorkspaces(options?: ApiCallOptions): Promise<ApiResponse> {
        return callEndpoint(apiRegistry.credits.fetchWorkspaces, options);
    },

    fetchBalance(wsId: string, options?: ApiCallOptions): Promise<ApiResponse> {
        return callEndpoint(apiRegistry.credits.fetchBalance, {
            ...options,
            params: { wsId, ...options?.params },
        });
    },

    resolve(wsId: string, options?: ApiCallOptions): Promise<ApiResponse> {
        return callEndpoint(apiRegistry.credits.resolve, {
            ...options,
            params: { wsId, ...options?.params },
        });
    },
});

const workspace = Object.freeze({
    move(projectId: string, targetWsId: string, options?: ApiCallOptions): Promise<ApiResponse> {
        return callEndpoint(apiRegistry.workspace.move, {
            ...options,
            params: { projectId, ...options?.params },
            body: { workspace_id: targetWsId, ...((options?.body as Record<string, unknown>) ?? {}) },
        });
    },

    rename(wsId: string, newName: string, options?: ApiCallOptions): Promise<ApiResponse> {
        return callEndpoint(apiRegistry.workspace.rename, {
            ...options,
            params: { wsId, ...options?.params },
            body: { name: newName, ...((options?.body as Record<string, unknown>) ?? {}) },
        });
    },

    markViewed(projectId: string, options?: ApiCallOptions): Promise<ApiResponse> {
        return callEndpoint(apiRegistry.workspace.markViewed, {
            ...options,
            params: { projectId, ...options?.params },
            body: options?.body ?? {},
        });
    },

    probe(options?: ApiCallOptions): Promise<ApiResponse> {
        return callEndpoint(apiRegistry.workspace.probe, options);
    },

    resolveByProject(projectId: string, options?: ApiCallOptions): Promise<ApiResponse> {
        return callEndpoint(apiRegistry.workspace.resolveByProject, {
            ...options,
            params: { projectId, ...options?.params },
        });
    },

    switchContext(wsId: string, options?: ApiCallOptions): Promise<ApiResponse> {
        return callEndpoint(apiRegistry.workspace.switchContext, {
            ...options,
            params: { wsId, ...options?.params },
        });
    },
});

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

export interface MarcoApiModule {
    call<T = unknown>(path: string, options?: ApiCallOptions): Promise<ApiResponse<T>>;
    credits: typeof credits;
    workspace: typeof workspace;
}

export function createApiModule(): MarcoApiModule {
    return {
        call,
        credits,
        workspace,
    };
}
