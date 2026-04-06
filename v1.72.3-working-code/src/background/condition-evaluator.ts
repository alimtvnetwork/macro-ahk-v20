/**
 * Marco Extension — Injection Condition Evaluator
 *
 * Evaluates pre-injection conditions: element presence,
 * cookie checks, delay requirements, and online status.
 * See spec 12-project-model-and-url-rules.md §InjectionConditions.
 */

import type { InjectionConditions } from "../shared/types";

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Result of condition evaluation. */
export interface ConditionResult {
    isMet: boolean;
    failedCondition: string | null;
}

/** Evaluates all injection conditions for a tab. */
export async function evaluateConditions(
    tabId: number,
    conditions: InjectionConditions,
): Promise<ConditionResult> {
    const cookieResult = await checkCookieCondition(conditions.requireCookie);
    const isCookieMissing = cookieResult === false;

    if (isCookieMissing) {
        return {
            isMet: false,
            failedCondition: `Cookie missing: ${conditions.requireCookie}`,
        };
    }

    const elementResult = await checkElementCondition(
        tabId,
        conditions.requireElement,
    );
    const isElementMissing = elementResult === false;

    if (isElementMissing) {
        return {
            isMet: false,
            failedCondition: `Element not found: ${conditions.requireElement}`,
        };
    }

    const isOnlineRequired = conditions.requireOnline === true;

    if (isOnlineRequired) {
        const isOffline = await checkOnlineCondition();

        if (isOffline) {
            return {
                isMet: false,
                failedCondition: "Network offline",
            };
        }
    }

    const hasDelay = conditions.minDelayMs > 0;

    if (hasDelay) {
        await applyDelay(conditions.minDelayMs);
    }

    return { isMet: true, failedCondition: null };
}

/* ------------------------------------------------------------------ */
/*  Cookie Check                                                       */
/* ------------------------------------------------------------------ */

/** Returns true if the required cookie exists or no cookie is required. */
async function checkCookieCondition(
    cookieName: string | null,
): Promise<boolean> {
    const isNoRequirement = cookieName === null;

    if (isNoRequirement) {
        return true;
    }

    try {
        const cookie = await chrome.cookies.get({
            url: "https://lovable.dev",
            name: cookieName!,
        });

        const hasCookie = cookie !== null;
        return hasCookie;
    } catch {
        return false;
    }
}

/* ------------------------------------------------------------------ */
/*  Element Check                                                      */
/* ------------------------------------------------------------------ */

/** Returns true if the required element exists in the tab's DOM. */
async function checkElementCondition(
    tabId: number,
    selector: string | null,
): Promise<boolean> {
    const isNoRequirement = selector === null;

    if (isNoRequirement) {
        return true;
    }

    try {
        const results = await chrome.scripting.executeScript({
            target: { tabId },
            func: checkDomElement,
            args: [selector!],
            world: "MAIN",
        });

        const hasResult = results.length > 0;
        return hasResult ? (results[0].result as boolean) : false;
    } catch {
        return false;
    }
}

/** Injected function to check for a DOM element. */
function checkDomElement(selector: string): boolean {
    const element = document.querySelector(selector);
    return element !== null;
}

/* ------------------------------------------------------------------ */
/*  Online Check                                                       */
/* ------------------------------------------------------------------ */

/** Returns true if network status is offline. */
async function checkOnlineCondition(): Promise<boolean> {
    try {
        const result = await chrome.storage.session.get("marco_network_status");
        const status = result["marco_network_status"];
        const isOffline = status === "offline";

        return isOffline;
    } catch {
        return false;
    }
}

/* ------------------------------------------------------------------ */
/*  Delay                                                              */
/* ------------------------------------------------------------------ */

/** Applies a millisecond delay before injection. */
function applyDelay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}
