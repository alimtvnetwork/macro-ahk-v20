/**
 * Riseup Macro SDK — Auth Module
 *
 * Provides marco.auth.* methods for token management.
 *
 * See: spec/18-marco-sdk-convention.md §marco.auth
 */

import { sendMessage } from "./bridge";

export interface AuthApi {
    getToken(): Promise<string | null>;
    getSource(): Promise<string>;
    refresh(): Promise<string | null>;
    isExpired(): Promise<boolean>;
    getJwtPayload(): Promise<Record<string, unknown> | null>;
}

export function createAuthApi(): AuthApi {
    return {
        getToken() {
            return sendMessage<string | null>("AUTH_GET_TOKEN");
        },
        getSource() {
            return sendMessage<string>("AUTH_GET_SOURCE");
        },
        refresh() {
            return sendMessage<string | null>("AUTH_REFRESH");
        },
        isExpired() {
            return sendMessage<boolean>("AUTH_IS_EXPIRED");
        },
        getJwtPayload() {
            return sendMessage<Record<string, unknown> | null>("AUTH_GET_JWT");
        },
    };
}
