/**
 * Developer Guide Section — Inline SDK docs for project tabs
 * See: spec/05-chrome-extension/65-developer-docs-and-project-slug.md
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, BookOpen, Copy, ClipboardCopy, AlertTriangle, ExternalLink, Stethoscope } from "lucide-react";
import { toast } from "sonner";

/** Sub-namespaces expected on every Projects.<CodeName> object — kept in sync with project-namespace-builder.ts */
const EXPECTED_SUB_NAMESPACES = [
  "vars", "urls", "xpath", "cookies", "kv", "files",
  "meta", "log", "scripts", "db", "api", "notify", "docs",
] as const;

/**
 * Build a one-line self-check snippet.
 * Reports presence of window.marco, RiseupAsiaMacroExt, and Projects.<CodeName>
 * with green ✅ / red ❌ console output.
 */
function buildSelfCheckSnippet(namespace: string): string {
  // namespace looks like: RiseupAsiaMacroExt.Projects.MacroController
  const parts = namespace.split(".");
  const codeName = parts[parts.length - 1] ?? "";
  return `(()=>{const g=globalThis,O="color:#22c55e;font-weight:bold",X="color:#ef4444;font-weight:bold",m=g.marco,r=g.RiseupAsiaMacroExt,p=r&&r.Projects&&r.Projects["${codeName}"];console.log("%c[SDK self-check] window.marco "+(m?"\u2705 "+(m.version||""):"\u274C missing"),m?O:X);console.log("%c[SDK self-check] RiseupAsiaMacroExt "+(r?"\u2705":"\u274C missing"),r?O:X);console.log("%c[SDK self-check] Projects.${codeName} "+(p?"\u2705 v"+((p.meta&&p.meta.version)||"?"):"\u274C missing"),p?O:X);})();`;
}

/**
 * Build an expandable extended diagnostics snippet.
 * Lists each expected sub-namespace under Projects.<CodeName> with ✅ / ❌.
 */
function buildExtendedDiagnosticsSnippet(namespace: string): string {
  const parts = namespace.split(".");
  const codeName = parts[parts.length - 1] ?? "";
  const expected = JSON.stringify([...EXPECTED_SUB_NAMESPACES]);
  return `(()=>{const g=globalThis,O="color:#22c55e",X="color:#ef4444",B="color:#a78bfa;font-weight:bold",p=g.RiseupAsiaMacroExt&&g.RiseupAsiaMacroExt.Projects&&g.RiseupAsiaMacroExt.Projects["${codeName}"];if(!p){console.log("%c[SDK extended] Projects.${codeName} \u274C missing — cannot enumerate sub-namespaces",X);return;}console.log("%c[SDK extended] Projects.${codeName} sub-namespaces:",B);${expected}.forEach(k=>{const ok=p[k]!==undefined&&p[k]!==null;console.log("%c  "+(ok?"\u2705":"\u274C")+" "+k,ok?O:X);});const extra=Object.keys(p).filter(k=>!${expected}.includes(k));if(extra.length){console.log("%c[SDK extended] Extra (non-standard) keys: "+extra.join(", "),"color:#f59e0b");}})();`;
}

export interface DevGuideTargetUrl {
  pattern: string;
  matchType: string;
}

interface Props {
  /** The full SDK namespace for this project, e.g. RiseupAsiaMacroExt.Projects.MacroController */
  namespace: string;
  /** Which section this guide is for */
  section: "urls" | "variables" | "xpath" | "cookies" | "scripts" | "kv" | "files" | "all";
  /** Optional URL rules — when provided, renders an "Open matched tab" helper button */
  targetUrls?: DevGuideTargetUrl[];
}

function copyText(text: string) {
  navigator.clipboard.writeText(text).then(() => toast.success("Copied to clipboard"));
}

/**
 * Resolve the first usable concrete URL from a project's URL rules.
 * Strategy:
 *   - "exact" → use as-is
 *   - "glob"  → replace `*` segments with sensible placeholders (no leading `*` host)
 *   - "regex" → skip (cannot reliably synthesize)
 * Returns null if no rule yields a launchable URL.
 */
function tryResolveOne(rule: DevGuideTargetUrl): string | null {
  if (!rule.pattern) return null;
  if (rule.matchType === "exact") {
    return /^https?:\/\//i.test(rule.pattern) ? rule.pattern : null;
  }
  if (rule.matchType === "glob") {
    if (/^https?:\/\/\*/i.test(rule.pattern)) return null; // wildcard host — handled in fallback
    const concrete = rule.pattern.replace(/\*+/g, "");
    return /^https?:\/\//i.test(concrete) ? concrete : null;
  }
  return null; // regex → skip
}

function tryResolveWildcardHost(rule: DevGuideTargetUrl): string | null {
  if (rule.matchType !== "glob" || !/^https?:\/\/\*/i.test(rule.pattern)) return null;
  const concrete = rule.pattern.replace(/^(https?:\/\/)\*\.?/i, "$1www.").replace(/\*+/g, "");
  return /^https?:\/\//i.test(concrete) ? concrete : null;
}

function resolveOpenableUrl(rules: DevGuideTargetUrl[]): string | null {
  for (const rule of rules) {
    const url = tryResolveOne(rule);
    if (url) return url;
  }
  for (const rule of rules) {
    const url = tryResolveWildcardHost(rule);
    if (url) return url;
  }
  return null;
}

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="relative group">
      {label && (
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</span>
      )}
      <pre className="rounded-md border border-border bg-background p-3 text-[11px] font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap mt-1">
        {code}
      </pre>
      <button
        type="button"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-foreground"
        onClick={() => copyText(code)}
        title="Copy"
      >
        <Copy className="h-3 w-3" />
      </button>
    </div>
  );
}

const sectionDocs: Record<string, (ns: string) => { title: string; description: string; snippets: Array<{ label: string; code: string }> }> = {
  urls: (ns) => ({
    title: "URL Rules Access",
    description: "URL rules determine when the extension activates on a page. Scripts can read the matched rule at runtime.",
    snippets: [
      { label: "Check if current URL matched a rule", code: `const matchedRule = ${ns}.urls.getMatched();\nconsole.log(matchedRule.pattern, matchedRule.label);` },
      { label: "Get all open rules", code: `const rules = ${ns}.urls.listOpen();\nrules.forEach(r => console.log(r.pattern, r.matchType));` },
      { label: "Get URL variables (from labeled rules)", code: `const urlVars = ${ns}.urls.getVariables();\nconsole.log(urlVars); // { login: "https://...", dashboard: "https://..." }` },
    ],
  }),
  variables: (ns) => ({
    title: "Variables Access",
    description: "Project variables are injected as a JSON object. Scripts can read/write them at runtime via the SDK.",
    snippets: [
      { label: "Read a variable", code: `const value = ${ns}.vars.get("apiKey");\nconsole.log(value);` },
      { label: "Set a variable", code: `await ${ns}.vars.set("apiKey", "sk-...");` },
      { label: "Get all variables", code: `const allVars = ${ns}.vars.getAll();\nconsole.log(allVars); // { apiKey: "sk-...", baseUrl: "https://..." }` },
      { label: "Template variable syntax in prompts", code: `// In prompt text, use {{variableName}}\n// e.g., "Deploy to {{environment}} server"\n// Variables are resolved before injection` },
    ],
  }),
  xpath: (ns) => ({
    title: "XPath Access",
    description: "XPath selectors stored in the project can be used to locate DOM elements reliably.",
    snippets: [
      { label: "Get the ChatBox XPath", code: `const xpath = ${ns}.xpath.getChatBox();\nconst el = document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);\nconsole.log(el.singleNodeValue);` },
      { label: "Use XPathUtils (global)", code: `// XPathUtils is injected globally\nconst el = XPathUtils.getByXPath("//button[@id='submit']");\nXPathUtils.reactClick(el);` },
      { label: "Find element by descriptor", code: `const el = XPathUtils.findElement({\n  xpath: "//textarea[@name='message']",\n  fallbackSelector: "textarea.chat-input"\n});` },
    ],
  }),
  cookies: (ns) => ({
    title: "Cookies Access",
    description: "Cookie rules bind browser cookies to named variables accessible in scripts. Rules define which cookies to capture by domain and name pattern.",
    snippets: [
      { label: "Read a bound cookie value", code: `const token = await ${ns}.cookies.get("sessionToken");\nconsole.log(token);` },
      { label: "List all bound cookies", code: `const cookies = await ${ns}.cookies.getAll();\nconsole.log(cookies);\n// { sessionToken: "abc123", csrfToken: "xyz789" }` },
      { label: "Cookie rule binding pattern", code: `// In the Cookies tab, set:\n//   Name: "session_id"\n//   Domain: "example.com"\n//   Match: "exact"\n//   Bind To: "sessionToken"\n//\n// Then in script:\n// const sid = await ${ns}.cookies.get("sessionToken");` },
    ],
  }),
  scripts: (ns) => ({
    title: "Scripts Access",
    description: "Scripts are injected in dependency-resolved order into the MAIN world. Each script has access to the full SDK namespace.",
    snippets: [
      { label: "Access project metadata", code: `const meta = ${ns}.meta;\nconsole.log(meta.name, meta.version, meta.slug);` },
      { label: "Store script-local data (KV)", code: `await ${ns}.kv.set("lastRun", new Date().toISOString());\nconst lastRun = await ${ns}.kv.get("lastRun");` },
      { label: "Log to extension", code: `${ns}.log.info("Script started");\n${ns}.log.warn("Rate limit approaching");\n${ns}.log.error("Failed to submit form", { step: 3 });` },
    ],
  }),
  kv: (ns) => ({
    title: "Key-Value Store",
    description: "Project-scoped persistent storage backed by SQLite. Data persists across sessions.",
    snippets: [
      { label: "Set a value", code: `await ${ns}.kv.set("counter", "42");` },
      { label: "Get a value", code: `const val = await ${ns}.kv.get("counter");` },
      { label: "Delete a key", code: `await ${ns}.kv.delete("counter");` },
      { label: "List all keys", code: `const keys = await ${ns}.kv.list();\nconsole.log(keys);` },
    ],
  }),
  files: (ns) => ({
    title: "File Storage",
    description: "Project-scoped file storage for binary and text assets. Files are pre-loaded into .files.cache for synchronous access.",
    snippets: [
      { label: "Save a file", code: `await ${ns}.files.save("config.json", JSON.stringify(config));` },
      { label: "Read a file (async)", code: `const data = await ${ns}.files.read("config.json");\nconst config = JSON.parse(data);` },
      { label: "List files", code: `const files = await ${ns}.files.list();` },
      { label: "Read from cache (sync)", code: `// Pre-loaded at injection time — no await needed\nconst config = JSON.parse(${ns}.files.cache["config.json"]);\n\n// List cached file names\nconst cachedFiles = Object.keys(${ns}.files.cache);` },
    ],
  }),
  db: (ns) => ({
    title: "Project Database (SQLite)",
    description: "Each project has its own SQLite database. Use the Prisma-style query builder to create tables and perform CRUD operations.",
    snippets: [
      { label: "Find many rows", code: `const users = await ${ns}.db.Users.findMany({\n  where: { active: true },\n  orderBy: { createdAt: "desc" },\n  take: 10\n});` },
      { label: "Find one row", code: `const user = await ${ns}.db.Users.findFirst({\n  where: { id: 42 }\n});` },
      { label: "Create a row", code: `const newUser = await ${ns}.db.Users.create({\n  data: { name: "Alice", email: "alice@example.com", active: true }\n});` },
      { label: "Update rows", code: `await ${ns}.db.Users.update({\n  where: { id: 42 },\n  data: { active: false }\n});` },
      { label: "Delete rows", code: `await ${ns}.db.Users.delete({\n  where: { id: 42 }\n});` },
      { label: "Count rows", code: `const count = await ${ns}.db.Users.count({\n  where: { active: true }\n});` },
    ],
  }),
  rest: (ns) => ({
    title: "REST API Endpoints",
    description: "Projects can expose custom REST-style endpoints accessible via the extension message bridge or localhost HTTP proxy (port 19280).",
    snippets: [
      { label: "Call a project endpoint (from script)", code: `const result = await ${ns}.api.call("get-users", {\n  method: "GET",\n  params: { active: true }\n});\nconsole.log(result.data);` },
      { label: "POST to a project endpoint", code: `const result = await ${ns}.api.call("create-user", {\n  method: "POST",\n  body: { name: "Alice", email: "alice@example.com" }\n});` },
      { label: "HTTP proxy URL pattern", code: `// From external tools (cURL, Postman, AHK):\n// GET  http://localhost:19280/api/<slug>/get-users?active=true\n// POST http://localhost:19280/api/<slug>/create-user` },
      { label: "cURL example", code: `curl http://localhost:19280/api/<slug>/get-users?active=true` },
    ],
  }),
};

/** Build a plain-text version of all visible sections for copy-all */
function buildFullGuideText(namespace: string, sections: string[]): string {
  const lines: string[] = [];
  lines.push(`# Developer Guide — ${namespace}`);
  lines.push(`SDK Namespace: ${namespace}`);
  lines.push("");

  for (const s of sections) {
    const doc = sectionDocs[s]?.(namespace);
    if (!doc) continue;
    lines.push(`## ${doc.title}`);
    lines.push(doc.description);
    lines.push("");
    for (const snippet of doc.snippets) {
      lines.push(`### ${snippet.label}`);
      lines.push("```javascript");
      lines.push(snippet.code);
      lines.push("```");
      lines.push("");
    }
  }
  return lines.join("\n");
}

// eslint-disable-next-line max-lines-per-function
export function DevGuideSection({ namespace, section, targetUrls }: Props) {
  const [expanded, setExpanded] = useState(false);
  const [showExtended, setShowExtended] = useState(false);
  const selfCheckSnippet = buildSelfCheckSnippet(namespace);
  const extendedSnippet = buildExtendedDiagnosticsSnippet(namespace);

  const sections = section === "all"
    ? Object.keys(sectionDocs)
    : [section];

  const handleCopyAll = () => {
    const text = buildFullGuideText(namespace, sections);
    copyText(text);
  };

  const openableUrl = targetUrls && targetUrls.length > 0
    ? resolveOpenableUrl(targetUrls)
    : null;

  const handleOpenMatchedTab = () => {
    if (!openableUrl) return;
    window.open(openableUrl, "_blank", "noopener,noreferrer");
    toast.success(`Opening ${openableUrl} — switch to that tab and use DevTools console`);
  };

  return (
    <div className="rounded-lg border border-border/60 bg-card/50 mt-4">
      <button
        type="button"
        className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-muted/20 transition-colors rounded-lg"
        onClick={() => setExpanded(!expanded)}
      >
        {expanded
          ? <ChevronDown className="h-4 w-4 text-primary" />
          : <ChevronRight className="h-4 w-4 text-muted-foreground" />
        }
        <BookOpen className="h-4 w-4 text-primary" />
        <span className="text-xs font-semibold text-foreground">Developer Guide</span>
        <span className="text-[10px] text-muted-foreground ml-1">
          — How to access the SDK from the page console & injected scripts
        </span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-border/40">
          {/* Context callout — explains where the SDK is reachable */}
          <div className="mt-3 rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2.5 flex gap-2.5">
            <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
            <div className="space-y-1.5 text-[11px] leading-relaxed">
              <p className="font-semibold text-foreground">
                Where can I run these snippets?
              </p>
              <p className="text-muted-foreground">
                <code className="font-mono text-foreground">RiseupAsiaMacroExt</code> and{" "}
                <code className="font-mono text-foreground">window.marco</code> are injected into the page's{" "}
                <strong className="text-foreground">MAIN world</strong>, only on tabs whose URL matches one of this project's URL rules
                (or the SDK's URL rules).
              </p>
              <ul className="list-disc list-inside text-muted-foreground space-y-0.5 pl-1">
                <li><strong className="text-foreground">✅ Works in:</strong> DevTools console of a matched tab (e.g. <code className="font-mono text-foreground">https://lovable.dev/projects/*</code>), and inside scripts injected by this extension.</li>
                <li><strong className="text-foreground">❌ Does NOT work in:</strong> the popup, options page, <code className="font-mono text-foreground">chrome://</code> URLs, <code className="font-mono text-foreground">about:blank</code>, or any non-matched tab — you'll get <code className="font-mono text-foreground">ReferenceError: RiseupAsiaMacroExt is not defined</code>.</li>
                <li><strong className="text-foreground">Tip:</strong> in DevTools, make sure the console's <em>top-frame context</em> is selected (default), not an iframe.</li>
              </ul>
            </div>
          </div>

          <div className="pt-1 flex items-start justify-between gap-3 flex-wrap">
            <div className="min-w-0">
              <p className="text-[11px] text-muted-foreground mb-1">
                SDK Namespace for this project:
              </p>
              <div className="flex items-center gap-2 flex-wrap">
                <code className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-1 rounded select-all">
                  {namespace}
                </code>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => copyText(namespace)}
                  title="Copy namespace"
                >
                  <Copy className="h-3 w-3" />
                </button>
                {openableUrl && (
                  <button
                    type="button"
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                    onClick={handleOpenMatchedTab}
                    title={`Open ${openableUrl} in a new tab so you can try the snippets in DevTools`}
                  >
                    <ExternalLink className="h-3 w-3" />
                    Open matched tab
                  </button>
                )}
              </div>
            </div>
            <button
              type="button"
              className="flex items-center gap-1.5 px-3 py-1.5 text-[11px] font-medium rounded-md border border-border bg-background hover:bg-muted/40 text-foreground transition-colors"
              onClick={handleCopyAll}
              title="Copy entire guide as text (for sharing with AI)"
            >
              <ClipboardCopy className="h-3.5 w-3.5" />
              Copy All
            </button>
          </div>

          {/* Quick self-check — verify SDK availability in the page context */}
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5 space-y-2">
            <div className="flex items-start gap-2.5">
              <Stethoscope className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="space-y-1.5 text-[11px] leading-relaxed flex-1 min-w-0">
                <p className="font-semibold text-foreground">Quick self-check</p>
                <p className="text-muted-foreground">
                  Paste this one-liner in the DevTools console of a matched tab — it reports{" "}
                  <code className="font-mono text-foreground">window.marco</code>,{" "}
                  <code className="font-mono text-foreground">RiseupAsiaMacroExt</code>, and{" "}
                  <code className="font-mono text-foreground">Projects.{namespace.split(".").pop()}</code>{" "}
                  with ✅/❌ and version info.
                </p>
              </div>
              <button
                type="button"
                className="shrink-0 flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                onClick={() => copyText(selfCheckSnippet)}
                title="Copy self-check snippet"
              >
                <Copy className="h-3 w-3" />
                Copy
              </button>
            </div>
            <pre className="rounded border border-border bg-background p-2 text-[10px] font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap">
              {selfCheckSnippet}
            </pre>

            {/* Expandable extended diagnostics */}
            <button
              type="button"
              className="w-full flex items-center gap-1.5 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors pt-1"
              onClick={() => setShowExtended(!showExtended)}
            >
              {showExtended
                ? <ChevronDown className="h-3 w-3" />
                : <ChevronRight className="h-3 w-3" />
              }
              <span>Extended diagnostics — list all sub-namespaces ({EXPECTED_SUB_NAMESPACES.length})</span>
            </button>

            {showExtended && (
              <div className="space-y-2 pt-1 border-t border-primary/20">
                <p className="text-[11px] text-muted-foreground">
                  This snippet enumerates every expected sub-namespace on{" "}
                  <code className="font-mono text-foreground">Projects.{namespace.split(".").pop()}</code>{" "}
                  ({EXPECTED_SUB_NAMESPACES.join(", ")}) and prints ✅/❌ for each, plus any non-standard extra keys.
                </p>
                <div className="flex justify-end">
                  <button
                    type="button"
                    className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                    onClick={() => copyText(extendedSnippet)}
                    title="Copy extended diagnostics snippet"
                  >
                    <Copy className="h-3 w-3" />
                    Copy extended
                  </button>
                </div>
                <pre className="rounded border border-border bg-background p-2 text-[10px] font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap">
                  {extendedSnippet}
                </pre>
              </div>
            )}
          </div>

          {sections.map((s) => {
            const doc = sectionDocs[s]?.(namespace);
            if (!doc) return null;
            return (
              <div key={s} className="space-y-2">
                <h4 className="text-xs font-bold text-foreground">{doc.title}</h4>
                <p className="text-[11px] text-muted-foreground">{doc.description}</p>
                {doc.snippets.map((snippet, i) => (
                  <CodeBlock key={i} label={snippet.label} code={snippet.code} />
                ))}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}