#!/usr/bin/env node
/**
 * check-spec-links.mjs
 *
 * Build-time guard that scans every Markdown file under `spec/` for relative
 * links and fails (exit 1) if any link target is missing on disk.
 *
 * Why: prevents silent rot of cross-spec references (e.g. links into
 * spec/12-devtools-and-injection/developer-guide/04-sdk-namespace.md) when
 * files are renamed, moved, or deleted without updating callers.
 *
 * Rules:
 *  - Scans files matching: spec/**\/*.md
 *  - Extracts `[text](target)` link patterns; ignores fenced code blocks (```).
 *  - Skips external/anchor targets (http(s)://, mailto:, tel:, #..., /..., mem://, knowledge://).
 *  - Skips false-positive prose like `[T](val)` where target has no `/`, `.`, or `#`.
 *  - Strips `#fragment` and `?query` before resolving.
 *  - Resolves the target relative to the markdown file's directory.
 *  - Fails if the resolved path does not exist on disk.
 *
 * Baseline:
 *  - A snapshot of pre-existing broken links lives at
 *    scripts/check-spec-links.baseline.json. Builds pass when current breaks
 *    match the baseline; they fail on any NEW break.
 *  - Regenerate the baseline after intentional spec moves:
 *      node scripts/check-spec-links.mjs --update-baseline
 *  - To ignore the baseline and fail on ANY broken link:
 *      node scripts/check-spec-links.mjs --strict
 *
 * Output format follows project Code Red logging:
 *   exact path, missing item, reason.
 */

import { readdirSync, readFileSync, statSync, existsSync, writeFileSync } from "node:fs";
import { join, resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = resolve(__dirname, "..");
const SPEC_ROOT = join(REPO_ROOT, "spec");
const BASELINE_PATH = join(REPO_ROOT, "scripts", "check-spec-links.baseline.json");

const SCRIPT_TAG = "[check-spec-links]";

const argv = new Set(process.argv.slice(2));
const UPDATE_BASELINE = argv.has("--update-baseline");
const STRICT = argv.has("--strict"); // ignore baseline; fail on ANY broken link

/** Recursively collect all .md files under a directory. */
function collectMarkdownFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...collectMarkdownFiles(full));
    } else if (st.isFile() && entry.toLowerCase().endsWith(".md")) {
      out.push(full);
    }
  }
  return out;
}

/** Strip fenced code blocks (``` ... ```) so we don't lint code samples. */
function stripFencedBlocks(source) {
  const lines = source.split(/\r?\n/);
  const out = [];
  let inFence = false;
  for (const line of lines) {
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      out.push(""); // preserve line numbers
      continue;
    }
    out.push(inFence ? "" : line);
  }
  return out.join("\n");
}

/** Returns true if the link target should be skipped (external / anchor / etc). */
function isSkippableTarget(target) {
  if (!target) return true;
  if (target.startsWith("#")) return true;
  if (target.startsWith("/")) return true; // root-relative — out of scope here
  if (target.startsWith("mem://")) return true;
  if (target.startsWith("knowledge://")) return true;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target)) return true; // http:, https:, mailto:, tel:, etc.
  // False-positive guard: real file links contain at least one of `/`, `.`, or `#`.
  // Things like `[T](val)` or `[K,V](items)` are TypeScript generic syntax in prose,
  // not markdown links — skip them.
  if (!/[/.#]/.test(target)) return true;
  return false;
}

/** Extract all markdown links (text, target, lineNumber) from a source string. */
function extractLinks(source) {
  const stripped = stripFencedBlocks(source);
  const links = [];
  const linkRegex = /\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  const lines = stripped.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let match;
    linkRegex.lastIndex = 0;
    while ((match = linkRegex.exec(line)) !== null) {
      links.push({
        text: match[1],
        target: match[2],
        lineNumber: i + 1,
      });
    }
  }
  return links;
}

function main() {
  if (!existsSync(SPEC_ROOT)) {
    console.error(
      `${SCRIPT_TAG} HARD ERROR — spec root not found.\n` +
        `  path: ${SPEC_ROOT}\n` +
        `  missing: directory 'spec/'\n` +
        `  reason: this script must be run from repo root and 'spec/' must exist.`
    );
    process.exit(1);
  }

  const files = collectMarkdownFiles(SPEC_ROOT);
  let totalLinks = 0;
  let checkedLinks = 0;
  const broken = [];

  for (const file of files) {
    const source = readFileSync(file, "utf8");
    const links = extractLinks(source);
    totalLinks += links.length;

    for (const link of links) {
      if (isSkippableTarget(link.target)) continue;
      checkedLinks++;

      // Strip fragment + query.
      const cleanTarget = link.target.split("#")[0].split("?")[0];
      if (!cleanTarget) continue; // pure fragment after split — skip

      const resolved = resolve(dirname(file), cleanTarget);

      if (!existsSync(resolved)) {
        broken.push({
          source: relative(REPO_ROOT, file),
          line: link.lineNumber,
          text: link.text,
          target: link.target,
          resolved: relative(REPO_ROOT, resolved),
        });
      }
    }
  }

  const summary =
    `${SCRIPT_TAG} scanned ${files.length} markdown files, ` +
    `${totalLinks} total links, ${checkedLinks} relative links checked.`;

  // Build a stable key for each broken link so the baseline survives unrelated
  // file edits (we key on source + target only, NOT line number).
  const keyOf = (b) => `${b.source}|${b.target}`;
  const currentKeys = new Set(broken.map(keyOf));

  // --update-baseline: snapshot ALL current breaks and exit OK.
  if (UPDATE_BASELINE) {
    const payload = {
      generatedAt: new Date().toISOString(),
      note: "Pre-existing broken relative links allowed to pass build. New breaks fail. Regenerate with: node scripts/check-spec-links.mjs --update-baseline",
      entries: broken
        .map((b) => ({ source: b.source, target: b.target }))
        .sort((a, b) => (keyOf(a) < keyOf(b) ? -1 : 1)),
    };
    writeFileSync(BASELINE_PATH, JSON.stringify(payload, null, 2) + "\n", "utf8");
    console.log(
      `${SCRIPT_TAG} baseline updated: ${broken.length} entries written to ${relative(
        REPO_ROOT,
        BASELINE_PATH
      )}.`
    );
    return;
  }

  // Load baseline (if present) so pre-existing rot doesn't fail the build.
  let baselineKeys = new Set();
  if (!STRICT && existsSync(BASELINE_PATH)) {
    try {
      const raw = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
      const entries = Array.isArray(raw?.entries) ? raw.entries : [];
      baselineKeys = new Set(entries.map((e) => `${e.source}|${e.target}`));
    } catch (err) {
      console.error(
        `${SCRIPT_TAG} HARD ERROR — failed to parse baseline.\n` +
          `  path: ${relative(REPO_ROOT, BASELINE_PATH)}\n` +
          `  reason: ${err instanceof Error ? err.message : String(err)}\n` +
          `  fix:    delete the file or regenerate via 'node scripts/check-spec-links.mjs --update-baseline'.`
      );
      process.exit(1);
    }
  }

  // Partition: new breaks (not in baseline) vs known/baselined.
  const newlyBroken = broken.filter((b) => !baselineKeys.has(keyOf(b)));
  const stale = [...baselineKeys].filter((k) => !currentKeys.has(k));

  if (broken.length === 0) {
    console.log(`${summary} OK — all relative links resolve.`);
    return;
  }

  if (newlyBroken.length === 0) {
    console.log(
      `${summary} OK — ${broken.length} pre-existing broken link(s) match baseline.` +
        (stale.length > 0
          ? ` Note: ${stale.length} baseline entr${stale.length === 1 ? "y is" : "ies are"} stale (resolved or removed); run --update-baseline to clean.`
          : "")
    );
    return;
  }

  console.error(
    `${SCRIPT_TAG} HARD ERROR — ${newlyBroken.length} NEW broken relative link(s) detected ` +
      `(${broken.length - newlyBroken.length} pre-existing in baseline).\n`
  );
  for (const b of newlyBroken) {
    console.error(
      `  source:   ${b.source}:${b.line}\n` +
        `  link:     [${b.text}](${b.target})\n` +
        `  missing:  ${b.resolved}\n` +
        `  reason:   target file does not exist on disk; rename or update the link.\n`
    );
  }
  console.error(
    summary +
      `\n${SCRIPT_TAG} If these breaks are intentional/pre-existing, run: node scripts/check-spec-links.mjs --update-baseline`
  );
  process.exit(1);
}

main();
