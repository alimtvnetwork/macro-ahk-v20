/**
 * Riseup Macro SDK — Auth Module
 *
 * Provides marco.auth.* methods for token management.
 *
 * See: spec/12-devtools-and-injection/sdk-convention.md §marco.auth
 */

import { sendMessage } from "./bridge";
import { getLastAuthDiag } from "./http";
import type { AuthResolutionDiag } from "./http";
import {
    extractAuthSourceFromBridgePayload,
    extractBearerTokenFromBridgePayload,
    extractBooleanFromBridgePayload,
    extractJwtPayloadFromBridgePayload,
} from "./auth-response";

export interface AuthApi {
    getToken(): Promise<string | null>;
    getSource(): Promise<string>;
    refresh(): Promise<string | null>;
    isExpired(): Promise<boolean>;
    getJwtPayload(): Promise<Record<string, unknown> | null>;
    getLastAuthDiag(): AuthResolutionDiag | null;
}

export function createAuthApi(): AuthApi {
    return {
        getToken() {
            return sendMessage<unknown>("AUTH_GET_TOKEN")
                .then((result) => {
                    return extractBearerTokenFromBridgePayload(result);
                });
        },
        getSource() {
            return sendMessage<unknown>("AUTH_GET_SOURCE")
                .then((result) => extractAuthSourceFromBridgePayload(result));
        },
        refresh() {
            return sendMessage<unknown>("AUTH_REFRESH")
                .then((result) => {
                    return extractBearerTokenFromBridgePayload(result);
                });
        },
        isExpired() {
            return sendMessage<unknown>("AUTH_IS_EXPIRED")
                .then((result) => extractBooleanFromBridgePayload(result, "isExpired"));
        },
        getJwtPayload() {
            return sendMessage<unknown>("AUTH_GET_JWT")
                .then((result) => extractJwtPayloadFromBridgePayload(result));
        },
        getLastAuthDiag() {
            return getLastAuthDiag();
        },
    };
}
