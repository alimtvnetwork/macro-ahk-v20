/**
 * Service Worker Global Shims
 *
 * Service workers have no DOM. Libraries (sql.js, Vite helpers, etc.) may
 * probe browser globals at import time. We shim everything once to avoid
 * repeated ReferenceError crashes.
 *
 * MUST be imported before any other module in the service worker entry.
 */

const noop = () => {};
const emptyNodeList: never[] = [];

function makeElement(): any {
    return {
        style: {},
        dataset: {},
        classList: {
            add: noop,
            remove: noop,
            toggle: noop,
            contains: () => false,
        },
        setAttribute: noop,
        getAttribute: () => null,
        removeAttribute: noop,
        appendChild: noop,
        removeChild: noop,
        insertBefore: noop,
        remove: noop,
        addEventListener: noop,
        removeEventListener: noop,
        dispatchEvent: () => true,
        getBoundingClientRect: () => ({
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: 0,
            height: 0,
        }),
        relList: {
            supports: () => false,
            add: noop,
            remove: noop,
            contains: () => false,
        },
        children: emptyNodeList,
        childNodes: emptyNodeList,
        parentNode: null,
        innerHTML: "",
        textContent: "",
        tagName: "DIV",
    };
}

function shimWindow(): void {
    if (typeof window !== "undefined") {
        return;
    }
    (globalThis as any).window = globalThis;
}

function shimDocument(): void {
    if (typeof document !== "undefined") {
        return;
    }

    const headEl = makeElement();
    const bodyEl = makeElement();

    (globalThis as any).document = {
        currentScript: null,
        documentElement: makeElement(),
        head: headEl,
        body: bodyEl,
        title: "",
        cookie: "",
        readyState: "complete",
        getElementsByTagName: () => emptyNodeList,
        getElementsByClassName: () => emptyNodeList,
        querySelector: () => null,
        querySelectorAll: () => emptyNodeList,
        getElementById: () => null,
        createElement: () => makeElement(),
        createElementNS: () => makeElement(),
        createTextNode: () => makeElement(),
        createDocumentFragment: () => makeElement(),
        createComment: () => makeElement(),
        addEventListener: noop,
        removeEventListener: noop,
        dispatchEvent: () => true,
        adoptNode: (n: any) => n,
        importNode: (n: any) => n,
    };
}

function shimDomClasses(): void {
    if (typeof HTMLElement === "undefined") {
        (globalThis as any).HTMLElement = class HTMLElement {};
    }
    if (typeof Element === "undefined") {
        (globalThis as any).Element = class Element {};
    }
    if (typeof Node === "undefined") {
        (globalThis as any).Node = class Node {};
    }
}

function shimNavigator(): void {
    if (typeof navigator !== "undefined") {
        return;
    }
    (globalThis as any).navigator = {
        userAgent: "service-worker",
        platform: "service-worker",
        language: "en",
        languages: ["en"],
        onLine: true,
        hardwareConcurrency: 1,
    };
}

function shimStorage(): void {
    if (typeof localStorage === "undefined") {
        const store = new Map<string, string>();
        (globalThis as any).localStorage = {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => store.set(k, v),
            removeItem: (k: string) => store.delete(k),
            clear: () => store.clear(),
            get length() { return store.size; },
            key: () => null,
        };
    }
    if (typeof sessionStorage === "undefined") {
        const store = new Map<string, string>();
        (globalThis as any).sessionStorage = {
            getItem: (k: string) => store.get(k) ?? null,
            setItem: (k: string, v: string) => store.set(k, v),
            removeItem: (k: string) => store.delete(k),
            clear: () => store.clear(),
            get length() { return store.size; },
            key: () => null,
        };
    }
}

function shimObservers(): void {
    if (typeof MutationObserver === "undefined") {
        (globalThis as any).MutationObserver = class MutationObserver {
            observe() {}
            disconnect() {}
            takeRecords() { return []; }
        };
    }
    if (typeof IntersectionObserver === "undefined") {
        (globalThis as any).IntersectionObserver = class IntersectionObserver {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    }
    if (typeof ResizeObserver === "undefined") {
        (globalThis as any).ResizeObserver = class ResizeObserver {
            observe() {}
            unobserve() {}
            disconnect() {}
        };
    }
}

function shimMiscApis(): void {
    if (typeof requestAnimationFrame === "undefined") {
        (globalThis as any).requestAnimationFrame = (cb: Function) => setTimeout(cb, 0);
        (globalThis as any).cancelAnimationFrame = (id: number) => clearTimeout(id);
    }
    if (typeof CustomEvent === "undefined") {
        (globalThis as any).CustomEvent = class CustomEvent extends Event {
            detail: any;
            constructor(type: string, params?: any) {
                super(type);
                this.detail = params?.detail ?? null;
            }
        };
    }
    if (typeof DOMParser === "undefined") {
        (globalThis as any).DOMParser = class DOMParser {
            parseFromString() { return (globalThis as any).document; }
        };
    }
    if (typeof XMLSerializer === "undefined") {
        (globalThis as any).XMLSerializer = class XMLSerializer {
            serializeToString() { return ""; }
        };
    }
    if (typeof getComputedStyle === "undefined") {
        (globalThis as any).getComputedStyle = () => new Proxy({}, { get: () => "" });
    }
    if (typeof matchMedia === "undefined") {
        (globalThis as any).matchMedia = () => ({
            matches: false,
            media: "",
            addEventListener: noop,
            removeEventListener: noop,
            addListener: noop,
            removeListener: noop,
        });
    }
}

/** Installs all browser-global shims for the service worker environment. */
export function installSwShims(): void {
    shimWindow();
    shimDocument();
    shimDomClasses();
    shimNavigator();
    shimStorage();
    shimObservers();
    shimMiscApis();
}

installSwShims();
