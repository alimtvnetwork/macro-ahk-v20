/**
 * Monaco JavaScript IntelliSense — registers type definitions, completion
 * providers, and compiler options for rich JS editing in the options page.
 *
 * Call `registerJsIntelliSense(monaco)` once during `beforeMount`.
 */

/* ------------------------------------------------------------------ */
/*  DOM & Browser API type stubs                                       */
/* ------------------------------------------------------------------ */

const DOM_TYPE_DEFS = `
declare var document: Document;
declare var window: Window & typeof globalThis;
declare var console: Console;
declare var localStorage: Storage;
declare var sessionStorage: Storage;
declare var navigator: Navigator;
declare var location: Location;
declare var history: History;
declare var fetch: typeof globalThis.fetch;
declare var setTimeout: typeof globalThis.setTimeout;
declare var setInterval: typeof globalThis.setInterval;
declare var clearTimeout: typeof globalThis.clearTimeout;
declare var clearInterval: typeof globalThis.clearInterval;
declare var requestAnimationFrame: (callback: FrameRequestCallback) => number;
declare var cancelAnimationFrame: (handle: number) => void;
declare var MutationObserver: typeof globalThis.MutationObserver;
declare var IntersectionObserver: typeof globalThis.IntersectionObserver;
declare var ResizeObserver: typeof globalThis.ResizeObserver;
declare var URL: typeof globalThis.URL;
declare var URLSearchParams: typeof globalThis.URLSearchParams;
declare var FormData: typeof globalThis.FormData;
declare var Headers: typeof globalThis.Headers;
declare var Request: typeof globalThis.Request;
declare var Response: typeof globalThis.Response;
declare var AbortController: typeof globalThis.AbortController;
declare var Blob: typeof globalThis.Blob;
declare var File: typeof globalThis.File;
declare var FileReader: typeof globalThis.FileReader;
declare var CustomEvent: typeof globalThis.CustomEvent;
declare var Event: typeof globalThis.Event;
declare var XMLHttpRequest: typeof globalThis.XMLHttpRequest;
declare var WebSocket: typeof globalThis.WebSocket;
declare var atob: (data: string) => string;
declare var btoa: (data: string) => string;
declare var structuredClone: <T>(value: T) => T;
declare var queueMicrotask: (callback: () => void) => void;
`;

const CHROME_EXTENSION_DEFS = `
declare namespace chrome {
  namespace runtime {
    const id: string;
    function sendMessage(message: any, responseCallback?: (response: any) => void): void;
    function sendMessage(extensionId: string, message: any, responseCallback?: (response: any) => void): void;
    function getURL(path: string): string;
    function getManifest(): { version: string; name: string; [key: string]: any };
    function openOptionsPage(callback?: () => void): void;
    const onMessage: {
      addListener(callback: (message: any, sender: any, sendResponse: (response?: any) => void) => boolean | void): void;
      removeListener(callback: Function): void;
    };
    const onInstalled: {
      addListener(callback: (details: { reason: string }) => void): void;
    };
    const lastError: { message?: string } | undefined;
  }
  namespace storage {
    interface StorageArea {
      get(keys: string | string[] | null, callback: (items: { [key: string]: any }) => void): void;
      set(items: { [key: string]: any }, callback?: () => void): void;
      remove(keys: string | string[], callback?: () => void): void;
      clear(callback?: () => void): void;
    }
    const local: StorageArea;
    const sync: StorageArea;
    const session: StorageArea;
    const onChanged: {
      addListener(callback: (changes: { [key: string]: { oldValue?: any; newValue?: any } }, areaName: string) => void): void;
    };
  }
  namespace tabs {
    interface Tab {
      id?: number;
      url?: string;
      title?: string;
      active: boolean;
      windowId: number;
      index: number;
    }
    function query(queryInfo: { active?: boolean; currentWindow?: boolean; url?: string }, callback: (tabs: Tab[]) => void): void;
    function create(createProperties: { url?: string; active?: boolean }, callback?: (tab: Tab) => void): void;
    function update(tabId: number, updateProperties: { url?: string; active?: boolean }, callback?: (tab?: Tab) => void): void;
    function remove(tabIds: number | number[], callback?: () => void): void;
    function sendMessage(tabId: number, message: any, responseCallback?: (response: any) => void): void;
    function executeScript(tabId: number, details: { code?: string; file?: string }, callback?: (result: any[]) => void): void;
    const onUpdated: {
      addListener(callback: (tabId: number, changeInfo: { status?: string; url?: string }, tab: Tab) => void): void;
    };
  }
  namespace scripting {
    function executeScript(injection: { target: { tabId: number }; func?: Function; files?: string[]; args?: any[] }): Promise<any[]>;
    function insertCSS(injection: { target: { tabId: number }; css?: string; files?: string[] }): Promise<void>;
  }
  namespace alarms {
    function create(name: string, alarmInfo: { delayInMinutes?: number; periodInMinutes?: number }): void;
    function clear(name: string, callback?: (wasCleared: boolean) => void): void;
    const onAlarm: {
      addListener(callback: (alarm: { name: string }) => void): void;
    };
  }
  namespace notifications {
    function create(notificationId: string, options: { type: string; title: string; message: string; iconUrl?: string }, callback?: (id: string) => void): void;
    function clear(notificationId: string, callback?: (wasCleared: boolean) => void): void;
  }
  namespace contextMenus {
    function create(createProperties: { id: string; title: string; contexts: string[] }, callback?: () => void): void;
    function remove(menuItemId: string, callback?: () => void): void;
    const onClicked: {
      addListener(callback: (info: { menuItemId: string; pageUrl?: string }, tab?: chrome.tabs.Tab) => void): void;
    };
  }
}
`;

/* ------------------------------------------------------------------ */
/*  Snippet completions                                                */
/* ------------------------------------------------------------------ */

interface MonacoModule {
  languages: {
    typescript: {
      javascriptDefaults: {
        setCompilerOptions: (options: Record<string, unknown>) => void;
        addExtraLib: (content: string, filePath?: string) => void;
        setDiagnosticsOptions: (options: Record<string, unknown>) => void;
        setEagerModelSync: (value: boolean) => void;
      };
    };
    registerCompletionItemProvider: (
      languageId: string,
      provider: Record<string, unknown>
    ) => { dispose: () => void };
    CompletionItemKind: Record<string, number>;
    CompletionItemInsertTextRule: Record<string, number>;
  };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  [key: string]: any;
}

function buildSnippets(monaco: MonacoModule) {
  const { Snippet } = monaco.languages.CompletionItemKind;
  const { InsertAsSnippet } = monaco.languages.CompletionItemInsertTextRule;

  return [
    { label: "log", detail: "console.log()", insertText: "console.log(${1:value});$0" },
    { label: "warn", detail: "console.warn()", insertText: "console.warn(${1:value});$0" },
    { label: "err", detail: "console.error()", insertText: "console.error(${1:value});$0" },
    { label: "fn", detail: "function declaration", insertText: "function ${1:name}(${2:params}) {\n\t$0\n}" },
    { label: "afn", detail: "async function", insertText: "async function ${1:name}(${2:params}) {\n\t$0\n}" },
    { label: "arrow", detail: "arrow function", insertText: "const ${1:name} = (${2:params}) => {\n\t$0\n};" },
    { label: "aarrow", detail: "async arrow function", insertText: "const ${1:name} = async (${2:params}) => {\n\t$0\n};" },
    { label: "iife", detail: "IIFE", insertText: "(function () {\n\t$0\n})();" },
    { label: "aiife", detail: "async IIFE", insertText: "(async function () {\n\t$0\n})();" },
    { label: "trycatch", detail: "try/catch block", insertText: "try {\n\t$1\n} catch (${2:error}) {\n\tconsole.error($2);\n\t$0\n}" },
    { label: "qs", detail: "document.querySelector", insertText: "document.querySelector('${1:selector}')$0" },
    { label: "qsa", detail: "document.querySelectorAll", insertText: "document.querySelectorAll('${1:selector}')$0" },
    { label: "gid", detail: "document.getElementById", insertText: "document.getElementById('${1:id}')$0" },
    { label: "ael", detail: "addEventListener", insertText: "${1:element}.addEventListener('${2:event}', (${3:e}) => {\n\t$0\n});" },
    { label: "ce", detail: "document.createElement", insertText: "document.createElement('${1:tag}')$0" },
    { label: "fetch", detail: "fetch request", insertText: "const ${1:response} = await fetch('${2:url}', {\n\tmethod: '${3|GET,POST,PUT,DELETE|}',\n\theaders: { 'Content-Type': 'application/json' },\n\t${4:body: JSON.stringify($5)}\n});\nconst ${6:data} = await $1.json();$0" },
    { label: "timeout", detail: "setTimeout", insertText: "setTimeout(() => {\n\t$0\n}, ${1:1000});" },
    { label: "interval", detail: "setInterval", insertText: "const ${1:timer} = setInterval(() => {\n\t$0\n}, ${2:1000});" },
    { label: "promise", detail: "new Promise", insertText: "new Promise((resolve, reject) => {\n\t$0\n})" },
    { label: "forin", detail: "for...in loop", insertText: "for (const ${1:key} in ${2:object}) {\n\t$0\n}" },
    { label: "forof", detail: "for...of loop", insertText: "for (const ${1:item} of ${2:iterable}) {\n\t$0\n}" },
    { label: "map", detail: ".map()", insertText: "${1:array}.map((${2:item}) => {\n\t$0\n})" },
    { label: "filter", detail: ".filter()", insertText: "${1:array}.filter((${2:item}) => {\n\t$0\n})" },
    { label: "reduce", detail: ".reduce()", insertText: "${1:array}.reduce((${2:acc}, ${3:item}) => {\n\t$0\n}, ${4:initialValue})" },
    { label: "observer", detail: "MutationObserver", insertText: "const ${1:observer} = new MutationObserver((mutations) => {\n\tfor (const mutation of mutations) {\n\t\t$0\n\t}\n});\n$1.observe(${2:document.body}, { childList: true, subtree: true });" },
    { label: "xpath", detail: "XPath evaluate", insertText: "document.evaluate(\n\t'${1:expression}',\n\t${2:document},\n\tnull,\n\tXPathResult.FIRST_ORDERED_NODE_TYPE,\n\tnull\n).singleNodeValue$0" },
    { label: "clipwrite", detail: "Write to clipboard", insertText: "await navigator.clipboard.writeText(${1:text});$0" },
    { label: "clipread", detail: "Read clipboard", insertText: "const ${1:text} = await navigator.clipboard.readText();$0" },
    // Chrome extension snippets
    { label: "csmsg", detail: "chrome.runtime.sendMessage", insertText: "chrome.runtime.sendMessage({ ${1:type}: '${2:action}' }, (response) => {\n\t$0\n});" },
    { label: "csget", detail: "chrome.storage.local.get", insertText: "chrome.storage.local.get('${1:key}', (result) => {\n\tconst ${2:value} = result['$1'];\n\t$0\n});" },
    { label: "csset", detail: "chrome.storage.local.set", insertText: "chrome.storage.local.set({ ${1:key}: ${2:value} }, () => {\n\t$0\n});" },
    { label: "ctabs", detail: "chrome.tabs.query active", insertText: "chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {\n\tconst ${1:tab} = tabs[0];\n\t$0\n});" },

    // ── Macro controller / automation snippets ──
    { label: "waitfor", detail: "waitForElement (polling)", insertText: "function waitForElement(selector, timeout = ${1:10000}) {\n\treturn new Promise((resolve, reject) => {\n\t\tconst el = document.querySelector(selector);\n\t\tif (el) return resolve(el);\n\t\tconst observer = new MutationObserver(() => {\n\t\t\tconst found = document.querySelector(selector);\n\t\t\tif (found) { observer.disconnect(); resolve(found); }\n\t\t});\n\t\tobserver.observe(document.body, { childList: true, subtree: true });\n\t\tsetTimeout(() => { observer.disconnect(); reject(new Error('Timeout: ' + selector)); }, timeout);\n\t});\n}$0" },
    { label: "waitxpath", detail: "waitForXPath element", insertText: "function waitForXPath(xpath, timeout = ${1:10000}) {\n\treturn new Promise((resolve, reject) => {\n\t\tconst check = () => {\n\t\t\tconst result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);\n\t\t\treturn result.singleNodeValue;\n\t\t};\n\t\tconst el = check();\n\t\tif (el) return resolve(el);\n\t\tconst observer = new MutationObserver(() => {\n\t\t\tconst found = check();\n\t\t\tif (found) { observer.disconnect(); resolve(found); }\n\t\t});\n\t\tobserver.observe(document.body, { childList: true, subtree: true });\n\t\tsetTimeout(() => { observer.disconnect(); reject(new Error('Timeout: ' + xpath)); }, timeout);\n\t});\n}$0" },
    { label: "clickxpath", detail: "clickByXPath helper", insertText: "function clickByXPath(xpath) {\n\tconst result = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);\n\tconst el = result.singleNodeValue;\n\tif (el) {\n\t\tel.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));\n\t\treturn true;\n\t}\n\treturn false;\n}$0" },
    { label: "clickqs", detail: "click by querySelector", insertText: "function clickElement(selector) {\n\tconst el = document.querySelector(selector);\n\tif (el) {\n\t\tel.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));\n\t\treturn true;\n\t}\n\treturn false;\n}$0" },
    { label: "delay", detail: "async delay(ms)", insertText: "const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));$0" },
    { label: "delayuse", detail: "await delay", insertText: "await new Promise(r => setTimeout(r, ${1:1000}));$0" },
    { label: "retry", detail: "retry with backoff", insertText: "async function retry(fn, { maxAttempts = ${1:3}, baseDelay = ${2:1000} } = {}) {\n\tfor (let attempt = 1; attempt <= maxAttempts; attempt++) {\n\t\ttry {\n\t\t\treturn await fn();\n\t\t} catch (err) {\n\t\t\tif (attempt === maxAttempts) throw err;\n\t\t\tawait new Promise(r => setTimeout(r, baseDelay * Math.pow(2, attempt - 1)));\n\t\t}\n\t}\n}$0" },
    { label: "poll", detail: "poll until condition", insertText: "async function pollUntil(conditionFn, interval = ${1:500}, timeout = ${2:10000}) {\n\tconst start = Date.now();\n\twhile (Date.now() - start < timeout) {\n\t\tif (conditionFn()) return true;\n\t\tawait new Promise(r => setTimeout(r, interval));\n\t}\n\tthrow new Error('Poll timeout');\n}$0" },
    { label: "inserttext", detail: "Insert text into input/contenteditable", insertText: "function insertText(el, text) {\n\tif (el.isContentEditable) {\n\t\tel.focus();\n\t\tel.textContent = text;\n\t\tel.dispatchEvent(new Event('input', { bubbles: true }));\n\t} else {\n\t\tconst nativeSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set\n\t\t\t|| Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;\n\t\tnativeSetter?.call(el, text);\n\t\tel.dispatchEvent(new Event('input', { bubbles: true }));\n\t}\n}$0" },
    { label: "toast", detail: "Show toast notification", insertText: "function showToast(message, type = '${1|info,success,error|}') {\n\tconst toast = document.createElement('div');\n\ttoast.textContent = message;\n\tObject.assign(toast.style, {\n\t\tposition: 'fixed', bottom: '20px', right: '20px', zIndex: '999999',\n\t\tpadding: '10px 18px', borderRadius: '8px', fontSize: '13px',\n\t\tcolor: '#fff', background: type === 'error' ? '#ef4444' : type === 'success' ? '#22c55e' : '#6366f1',\n\t\tboxShadow: '0 4px 12px rgba(0,0,0,0.3)', transition: 'opacity 0.3s',\n\t});\n\tdocument.body.appendChild(toast);\n\tsetTimeout(() => { toast.style.opacity = '0'; setTimeout(() => toast.remove(), 300); }, ${2:3000});\n}$0" },
    { label: "debounce", detail: "Debounce function", insertText: "function debounce(fn, wait = ${1:300}) {\n\tlet timer;\n\treturn (...args) => {\n\t\tclearTimeout(timer);\n\t\ttimer = setTimeout(() => fn(...args), wait);\n\t};\n}$0" },
    { label: "throttle", detail: "Throttle function", insertText: "function throttle(fn, limit = ${1:300}) {\n\tlet last = 0;\n\treturn (...args) => {\n\t\tconst now = Date.now();\n\t\tif (now - last >= limit) {\n\t\t\tlast = now;\n\t\t\tfn(...args);\n\t\t}\n\t};\n}$0" },
    { label: "lsget", detail: "localStorage get JSON", insertText: "JSON.parse(localStorage.getItem('${1:key}') || '${2:null}')$0" },
    { label: "lsset", detail: "localStorage set JSON", insertText: "localStorage.setItem('${1:key}', JSON.stringify(${2:value}));$0" },
    { label: "domready", detail: "DOMContentLoaded wrapper", insertText: "if (document.readyState === 'loading') {\n\tdocument.addEventListener('DOMContentLoaded', () => {\n\t\t$0\n\t});\n} else {\n\t$0\n}" },
    { label: "injectcss", detail: "Inject CSS stylesheet", insertText: "const style = document.createElement('style');\nstyle.textContent = \\`\n\t${1:/* CSS rules */}\n\\`;\ndocument.head.appendChild(style);$0" },
    { label: "injectscript", detail: "Inject script tag", insertText: "const script = document.createElement('script');\nscript.src = '${1:url}';\nscript.onload = () => { $0 };\ndocument.head.appendChild(script);" },
    { label: "watchdom", detail: "Watch DOM for changes", insertText: "const ${1:watcher} = new MutationObserver((mutations) => {\n\tfor (const m of mutations) {\n\t\tfor (const node of m.addedNodes) {\n\t\t\tif (node.nodeType === 1 && node.matches('${2:selector}')) {\n\t\t\t\t$0\n\t\t\t}\n\t\t}\n\t}\n});\n$1.observe(${3:document.body}, { childList: true, subtree: true });" },
    { label: "simclick", detail: "Simulate full click event", insertText: "function simulateClick(el) {\n\t['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click'].forEach(type => {\n\t\tel.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true }));\n\t});\n}$0" },
    { label: "simtype", detail: "Simulate typing keystroke-by-keystroke", insertText: "async function simulateType(el, text, delayMs = ${1:50}) {\n\tel.focus();\n\tfor (const ch of text) {\n\t\tel.dispatchEvent(new KeyboardEvent('keydown', { key: ch, bubbles: true }));\n\t\tel.dispatchEvent(new KeyboardEvent('keypress', { key: ch, bubbles: true }));\n\t\tdocument.execCommand('insertText', false, ch);\n\t\tel.dispatchEvent(new KeyboardEvent('keyup', { key: ch, bubbles: true }));\n\t\tawait new Promise(r => setTimeout(r, delayMs));\n\t}\n}$0" },
    { label: "macroloop", detail: "Macro loop with cycle counter", insertText: "let ${1:cycle} = 0;\nconst ${2:loopTimer} = setInterval(async () => {\n\t$1++;\n\tconsole.log(\\`[Macro] Cycle \\${$1}\\`);\n\ttry {\n\t\t$0\n\t} catch (err) {\n\t\tconsole.error('[Macro] Error:', err);\n\t}\n}, ${3:5000});" },
    { label: "backoff", detail: "Exponential backoff helper", insertText: "async function withBackoff(fn, { maxRetries = ${1:5}, baseMs = ${2:2000} } = {}) {\n\tfor (let i = 0; i < maxRetries; i++) {\n\t\ttry {\n\t\t\treturn await fn();\n\t\t} catch (err) {\n\t\t\tif (i === maxRetries - 1) throw err;\n\t\t\tconst wait = baseMs * Math.pow(2, i);\n\t\t\tconsole.warn(\\`[Backoff] Retry \\${i + 1}/\\${maxRetries} in \\${wait}ms\\`);\n\t\t\tawait new Promise(r => setTimeout(r, wait));\n\t\t}\n\t}\n}$0" },
  ].map((s) => ({
    ...s,
    kind: Snippet,
    insertTextRules: InsertAsSnippet,
  }));
}

/* ------------------------------------------------------------------ */
/*  Registration                                                       */
/* ------------------------------------------------------------------ */

export function registerJsIntelliSense(monaco: MonacoModule): void {
  const jsDefaults = monaco.languages.typescript.javascriptDefaults;

  // Compiler options for JS IntelliSense
  jsDefaults.setCompilerOptions({
    target: 99, // ESNext
    module: 99, // ESNext
    allowJs: true,
    checkJs: false,
    strict: false,
    noEmit: true,
    allowNonTsExtensions: true,
    lib: ["es2022", "dom", "dom.iterable"],
  });

  // Diagnostics: show suggestions but not semantic errors (it's JS, not TS)
  jsDefaults.setDiagnosticsOptions({
    noSemanticValidation: true,
    noSyntaxValidation: false,
    diagnosticCodesToIgnore: [80001, 2307, 2304, 2552, 2580, 1375, 1378],
  });

  // Add type definitions
  jsDefaults.addExtraLib(DOM_TYPE_DEFS, "ts:dom-globals.d.ts");
  jsDefaults.addExtraLib(CHROME_EXTENSION_DEFS, "ts:chrome-extension.d.ts");

  // Enable eager model sync for better IntelliSense
  jsDefaults.setEagerModelSync(true);

  // Register snippet completion provider
  const snippets = buildSnippets(monaco);

  monaco.languages.registerCompletionItemProvider("javascript", {
    provideCompletionItems: (_model: unknown, position: { lineNumber: number; column: number }) => {
      const range = {
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      };
      return {
        suggestions: snippets.map((s) => ({ ...s, range })),
      };
    },
  });
}
