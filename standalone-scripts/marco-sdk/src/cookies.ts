/**
 * Riseup Macro SDK — Cookies Module
 *
 * Provides marco.cookies.* methods for cookie access.
 *
 * See: spec/12-devtools-and-injection/sdk-convention.md §marco.cookies
 */

import { sendMessage } from "./bridge";

export interface CookieDetail {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number | null;
    secure: boolean;
    httpOnly: boolean;
    sameSite: "strict" | "lax" | "none";
}

export interface CookiesApi {
    get(name: string): Promise<string | null>;
    getDetail(name: string): Promise<CookieDetail | null>;
    getAll(): Promise<CookieDetail[]>;
}

export function createCookiesApi(): CookiesApi {
    return {
        get(name: string) {
            return sendMessage<string | null>("COOKIES_GET", { name });
        },
        getDetail(name: string) {
            return sendMessage<CookieDetail | null>("COOKIES_GET_DETAIL", { name });
        },
        getAll() {
            return sendMessage<CookieDetail[]>("COOKIES_GET_ALL");
        },
    };
}
