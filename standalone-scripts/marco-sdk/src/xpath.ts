/**
 * Riseup Macro SDK — XPath Module
 *
 * Provides marco.xpath.* methods for XPath expression management and evaluation.
 * resolve/resolveAll are synchronous — they evaluate against a cached XPath map.
 *
 * See: spec/12-devtools-and-injection/sdk-convention.md §marco.xpath
 */

import { sendMessage } from "./bridge";

let xpathCache: Record<string, string> = {};

export interface XPathApi {
    get(key: string): Promise<string | null>;
    getAll(): Promise<Record<string, string>>;
    resolve(key: string): Element | null;
    resolveAll(key: string): Element[];
    refreshCache(): Promise<void>;
}

export function createXPathApi(): XPathApi {
    return {
        async get(key: string) {
            return sendMessage<string | null>("XPATH_GET", { key });
        },
        async getAll() {
            return sendMessage<Record<string, string>>("XPATH_GET_ALL");
        },
        resolve(key: string): Element | null {
            const expression = xpathCache[key];
            if (!expression) return null;

            const result = document.evaluate(
                expression,
                document,
                null,
                XPathResult.FIRST_ORDERED_NODE_TYPE,
                null,
            );
            return result.singleNodeValue as Element | null;
        },
        resolveAll(key: string): Element[] {
            const expression = xpathCache[key];
            if (!expression) return [];

            const result = document.evaluate(
                expression,
                document,
                null,
                XPathResult.ORDERED_NODE_SNAPSHOT_TYPE,
                null,
            );
            const elements: Element[] = [];
            for (let i = 0; i < result.snapshotLength; i++) {
                const node = result.snapshotItem(i);
                if (node) elements.push(node as Element);
            }
            return elements;
        },
        async refreshCache() {
            xpathCache = await sendMessage<Record<string, string>>("XPATH_GET_ALL");
        },
    };
}

/**
 * Populate the XPath cache on SDK init.
 */
export async function initXPathCache(): Promise<void> {
    try {
        xpathCache = await sendMessage<Record<string, string>>("XPATH_GET_ALL");
    } catch {
        xpathCache = {};
    }
}
