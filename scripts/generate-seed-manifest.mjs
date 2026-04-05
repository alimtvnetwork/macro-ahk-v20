#!/usr/bin/env node
/**
 * generate-seed-manifest.mjs
 *
 * Scans all standalone-scripts projects' dist/instruction.json files
 * to produce a single seed-manifest.json that the extension seeder
 * reads at runtime.
 *
 * instruction.json is the SOLE source of truth — script-manifest.json
 * is no longer required.
 *
 * Usage:
 *   node scripts/generate-seed-manifest.mjs [--out <path>]
 *
 * Default output: chrome-extension/dist/projects/seed-manifest.json
 * Also writes to: standalone-scripts/_generated/seed-manifest.json (for reference)
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = resolve(import.meta.dirname, "..");
const STANDALONE_DIR = join(ROOT, "standalone-scripts");

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

function main() {
    const outArg = process.argv.indexOf("--out");
    const defaultOut = join(ROOT, "chrome-extension", "dist", "projects", "seed-manifest.json");
    const outPath = outArg !== -1 ? resolve(process.argv[outArg + 1]) : defaultOut;

    if (!existsSync(STANDALONE_DIR)) {
        console.error("❌ standalone-scripts/ directory not found");
        process.exit(1);
    }

    const folders = readdirSync(STANDALONE_DIR, { withFileTypes: true })
        .filter(d => d.isDirectory() && !d.name.startsWith("_") && d.name !== "prompts");

    const projects = [];

    for (const folder of folders) {
        const name = folder.name;
        const projectDir = join(STANDALONE_DIR, name);
        const sourceInstructionPath = join(projectDir, "src", "instruction.ts");
        const instructionPath = join(STANDALONE_DIR, name, "dist", "instruction.json");

        ensureFreshInstructionJson(name, projectDir, sourceInstructionPath, instructionPath);

        if (!existsSync(instructionPath)) {
            console.warn(`⚠ Skipping ${name}: no dist/instruction.json (run compile-instruction first)`);
            continue;
        }

        const instruction = JSON.parse(readFileSync(instructionPath, "utf-8"));
        const projectEntry = buildProjectEntry(name, instruction);
        projects.push(projectEntry);
    }

    // Sort by loadOrder
    projects.sort((a, b) => a.loadOrder - b.loadOrder);

    const manifest = {
        generatedAt: new Date().toISOString(),
        schemaVersion: 1,
        projects,
    };

    const json = JSON.stringify(manifest, null, 2) + "\n";

    // Write to output path
    mkdirSync(resolve(outPath, ".."), { recursive: true });
    writeFileSync(outPath, json, "utf-8");
    console.log(`✅ seed-manifest.json → ${outPath} (${projects.length} projects)`);

    // Also write a reference copy alongside standalone-scripts
    const refDir = join(STANDALONE_DIR, "_generated");
    mkdirSync(refDir, { recursive: true });
    writeFileSync(join(refDir, "seed-manifest.json"), json, "utf-8");
}

function ensureFreshInstructionJson(name, projectDir, sourceInstructionPath, instructionPath) {
    const sourceExists = existsSync(sourceInstructionPath);
    const distExists = existsSync(instructionPath);

    if (!sourceExists) {
        return;
    }

    const shouldCompile = !distExists || statSync(sourceInstructionPath).mtimeMs > statSync(instructionPath).mtimeMs;
    if (!shouldCompile) {
        return;
    }

    const relativeProjectDir = projectDir.replace(ROOT + "/", "");
    console.log(`↻ Refreshing stale instruction.json for ${name}`);
    execFileSync(process.execPath, [join(ROOT, "scripts", "compile-instruction.mjs"), relativeProjectDir], {
        cwd: ROOT,
        stdio: "inherit",
    });
}

/* ------------------------------------------------------------------ */
/*  Builder                                                            */
/* ------------------------------------------------------------------ */

function buildProjectEntry(name, instruction) {
    const basePath = `projects/scripts/${name}`;

    // Read seed block from instruction (the single source of truth)
    const seed = instruction.seed || {};

    const displayName = instruction.displayName || name;
    const version = instruction.version || "1.0.0";
    const description = instruction.description || "";
    const world = instruction.world || "MAIN";
    const loadOrder = instruction.loadOrder ?? 99;
    const isGlobal = instruction.isGlobal === true;
    const dependencies = instruction.dependencies || [];

    // Build script entries from instruction.assets.scripts
    const scripts = [];
    if (instruction.assets?.scripts?.length) {
        for (const s of instruction.assets.scripts) {
            scripts.push({
                seedId: seed.id || `default-${name}`,
                file: s.file,
                filePath: `${basePath}/${s.file}`,
                order: s.order ?? 0,
                isIife: s.isIife ?? true,
                configBinding: s.configBinding,
                themeBinding: s.themeBinding,
                cookieBinding: seed.cookieBinding,
                runAt: seed.runAt,
                description: description,
                autoInject: seed.autoInject ?? true,
            });
        }
    }

    // Build config entries from instruction.assets.configs
    const configs = [];
    if (instruction.assets?.configs?.length) {
        const configIds = seed.configSeedIds || {};
        for (const c of instruction.assets.configs) {
            configs.push({
                seedId: configIds[c.key] || `default-${name}-${c.key}`,
                file: c.file,
                filePath: `${basePath}/${c.file}`,
                key: c.key,
                injectAs: c.injectAs,
                description: `${c.key} config for ${displayName}`,
            });
        }
    }

    // Build CSS entries
    const css = (instruction.assets?.css || []).map(c => ({
        file: c.file,
        filePath: `${basePath}/${c.file}`,
        inject: c.inject || "head",
    }));

    // Build template entries
    const templates = (instruction.assets?.templates || []).map(t => ({
        file: t.file,
        filePath: `${basePath}/${t.file}`,
        injectAs: t.injectAs,
    }));

    // Build prompt entries
    const prompts = (instruction.assets?.prompts || []).map(p => ({
        file: p.file,
        filePath: `${basePath}/${p.file}`,
    }));

    return {
        name,
        displayName,
        version,
        description,
        seedId: seed.id || `default-${name}`,
        seedOnInstall: seed.seedOnInstall ?? true,
        world,
        loadOrder,
        isGlobal,
        isRemovable: seed.isRemovable ?? true,
        dependencies,
        scripts,
        configs,
        css,
        templates,
        prompts,
        targetUrls: seed.targetUrls || [],
        cookies: seed.cookies || [],
        settings: seed.settings || {},
    };
}

main();
