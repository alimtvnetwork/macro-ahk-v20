/**
 * Developer Guide Section — Inline SDK docs for project tabs
 * See: spec/05-chrome-extension/65-developer-docs-and-project-slug.md
 */
import { useState } from "react";
import { ChevronDown, ChevronRight, BookOpen, Copy, ClipboardCopy, AlertTriangle, ExternalLink, Stethoscope } from "lucide-react";
import { toast } from "sonner";

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
function resolveOpenableUrl(rules: DevGuideTargetUrl[]): string | null {
  for (const rule of rules) {
    if (!rule.pattern) continue;
    if (rule.matchType === "exact") {
      if (/^https?:\/\//i.test(rule.pattern)) return rule.pattern;
      continue;
    }
    if (rule.matchType === "glob") {
      // Skip patterns with wildcard hostnames — we can't pick a real subdomain
      // (e.g. "https://*.lovable.app/*" — leave to next rule).
      if (/^https?:\/\/\*/i.test(rule.pattern)) continue;
      // Replace path-level "*" with empty so "https://lovable.dev/projects/*" → "https://lovable.dev/projects/"
      const concrete = rule.pattern.replace(/\*+/g, "");
      if (/^https?:\/\//i.test(concrete)) return concrete;
    }
    // regex → skip
  }
  // Fallback: try wildcard hostnames by substituting `www`
  for (const rule of rules) {
    if (rule.matchType === "glob" && /^https?:\/\/\*/i.test(rule.pattern)) {
      const concrete = rule.pattern.replace(/^(https?:\/\/)\*\.?/i, "$1www.").replace(/\*+/g, "");
      if (/^https?:\/\//i.test(concrete)) return concrete;
    }
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

/**
 * Build a one-liner self-check snippet that reports whether the SDK
 * globals are reachable in the current page context, with green/red
 * console output via %c CSS styling.
 *
 * Output (example):
 *   ✅ window.marco              defined (v2.152.0)
 *   ✅ RiseupAsiaMacroExt        defined
 *   ✅ Projects.MacroController  defined
 *   ✅ All checks passed — SDK ready.
 *
 * Or on failure:
 *   ❌ window.marco              MISSING
 *   ❌ RiseupAsiaMacroExt        MISSING
 *   ❌ Projects.MacroController  MISSING
 *   ❌ SDK NOT INJECTED — check that this tab's URL matches a project rule
 *      and that DevTools console is on the top frame (not an iframe).
 */
function buildSelfCheckSnippet(namespace: string): string {
  // Extract the codeName from "RiseupAsiaMacroExt.Projects.<CodeName>"
  const codeName = namespace.split(".").pop() ?? "<CodeName>";
  const ok = "color:#22c55e;font-weight:bold";
  const bad = "color:#ef4444;font-weight:bold";
  const dim = "color:#94a3b8";
  return [
    `(()=>{`,
    `var m=window.marco,r=window.RiseupAsiaMacroExt,p=r&&r.Projects&&r.Projects["${codeName}"];`,
    `var f=function(l,v,e){console.log("%c"+(v?"\\u2705":"\\u274C")+" %c"+l.padEnd(34)+"%c"+(v?(" defined"+(e?" ("+e+")":"")):" MISSING"),v?"${ok}":"${bad}","color:inherit","${dim}");};`,
    `f("window.marco",!!m,m&&m.version);`,
    `f("window.RiseupAsiaMacroExt",!!r);`,
    `f("RiseupAsiaMacroExt.Projects.${codeName}",!!p,p&&p.meta&&p.meta.version);`,
    `if(m&&r&&p)console.log("%c\\u2705 All checks passed \\u2014 SDK ready.","${ok};font-size:13px");`,
    `else console.log("%c\\u274C SDK NOT INJECTED \\u2014 check that this tab\\u2019s URL matches a project rule and the DevTools console is on the top frame (not an iframe).","${bad};font-size:13px");`,
    `})();`,
  ].join("");
}

// eslint-disable-next-line max-lines-per-function
export function DevGuideSection({ namespace, section, targetUrls }: Props) {
  const [expanded, setExpanded] = useState(false);
  const selfCheckSnippet = buildSelfCheckSnippet(namespace);

  const handleCopySelfCheck = () => {
    copyText(selfCheckSnippet);
    toast.success("Self-check copied — paste into the DevTools console of a matched tab");
  };

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

          {/* Self-check one-liner — paste into console to verify SDK reachability */}
          <div className="rounded-md border border-primary/30 bg-primary/5 px-3 py-2.5 space-y-2">
            <div className="flex items-start gap-2.5">
              <Stethoscope className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-[11px] font-semibold text-foreground">
                  Quick self-check
                </p>
                <p className="text-[11px] text-muted-foreground">
                  Paste this one-liner into the DevTools console (on a matched tab) — it prints color-coded ✅/❌ output for{" "}
                  <code className="font-mono text-foreground">window.marco</code>,{" "}
                  <code className="font-mono text-foreground">RiseupAsiaMacroExt</code>, and{" "}
                  <code className="font-mono text-foreground">Projects.{namespace.split(".").pop()}</code>.
                </p>
              </div>
              <button
                type="button"
                className="flex items-center gap-1 px-2 py-1 text-[10px] font-medium rounded-md border border-primary/40 bg-primary/10 hover:bg-primary/20 text-primary transition-colors shrink-0"
                onClick={handleCopySelfCheck}
                title="Copy self-check one-liner"
              >
                <Copy className="h-3 w-3" />
                Copy
              </button>
            </div>
            <pre className="rounded-md border border-border bg-background p-2 text-[10px] font-mono text-foreground/80 overflow-x-auto whitespace-pre-wrap select-all">
              {selfCheckSnippet}
            </pre>
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