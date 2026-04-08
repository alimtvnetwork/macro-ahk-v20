/**
 * Marco Extension — Root Vite Build Config
 *
 * Builds the Chrome extension from root src/ (React popup)
 * and chrome-extension/src/ (background SW, options page).
 *
 * Usage: npx vite build --config vite.config.extension.ts
 */

import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import { visualizer } from "rollup-plugin-visualizer";
import { viteStaticCopy } from "vite-plugin-static-copy";
import { resolve } from "path";
import {
    copyFileSync,
    mkdirSync,
    existsSync,
    readFileSync,
    writeFileSync,
    readdirSync,
} from "fs";
import { execSync } from "node:child_process";

const EXT_DIR = resolve(__dirname, "chrome-extension");
const DIST_DIR = resolve(EXT_DIR, "dist");

function resolveDeclaredAssetSource(
    projectRootDir: string,
    projectDistDir: string,
    fileName: string,
    assetKey?: string,
): string | null {
    const directCandidates = [
        resolve(projectDistDir, fileName),
        resolve(projectRootDir, fileName),
    ];

    for (const candidate of directCandidates) {
        if (existsSync(candidate)) {
            return candidate;
        }
    }

    const rootFiles = existsSync(projectRootDir)
        ? readdirSync(projectRootDir).filter((file) => !file.startsWith("."))
        : [];
    const normalizedFileName = fileName.toLowerCase();
    const prefixedMatch = rootFiles.find((file) => file.toLowerCase().endsWith(`-${normalizedFileName}`));

    if (prefixedMatch) {
        return resolve(projectRootDir, prefixedMatch);
    }

    if (assetKey === "config") {
        const configMatch = rootFiles.find(
            (file) => /\.json$/i.test(file)
                && /config/i.test(file)
                && !/instruction|theme|prompt/i.test(file),
        );
        if (configMatch) {
            return resolve(projectRootDir, configMatch);
        }
    }

    if (assetKey === "theme") {
        const themeMatch = rootFiles.find(
            (file) => /\.json$/i.test(file) && /theme/i.test(file),
        );
        if (themeMatch) {
            return resolve(projectRootDir, themeMatch);
        }
    }

    return null;
}

/* ------------------------------------------------------------------ */
/*  Plugins                                                            */
/* ------------------------------------------------------------------ */

/** Copies and rewrites manifest.json to dist/. */
function copyManifest(): Plugin {
    return {
        name: "copy-manifest",
        writeBundle() {
            mkdirSync(DIST_DIR, { recursive: true });

            const manifest = JSON.parse(
                readFileSync(resolve(EXT_DIR, "manifest.json"), "utf-8"),
            );

            manifest.background.service_worker = "background/index.js";
            manifest.action.default_popup = "src/popup/popup.html";
            manifest.action.default_icon = {
                "16": "assets/icons/icon-16.png",
                "48": "assets/icons/icon-48.png",
                "128": "assets/icons/icon-128.png",
            };
            manifest.options_page = "src/options/options.html";
            manifest.icons = {
                "16": "assets/icons/icon-16.png",
                "48": "assets/icons/icon-48.png",
                "128": "assets/icons/icon-128.png",
            };
            manifest.web_accessible_resources = [
                {
                    resources: [
                        "wasm/sql-wasm.wasm",
                        "build-meta.json",
                        "prompts/macro-prompts.json",
                        "projects/seed-manifest.json",
                        "projects/scripts/*/*",
                    ],
                    matches: ["<all_urls>"],
                },
            ];

            writeFileSync(
                resolve(DIST_DIR, "manifest.json"),
                JSON.stringify(manifest, null, 2),
            );
        },
    };
}

/** Copies icon assets to dist/assets/icons/. */
function copyIcons(): Plugin {
    return {
        name: "copy-icons",
        writeBundle() {
            const destDir = resolve(DIST_DIR, "assets", "icons");
            const srcDir = resolve(EXT_DIR, "src", "assets", "icons");

            mkdirSync(destDir, { recursive: true });

            for (const size of ["16", "48", "128"]) {
                const filename = `icon-${size}.png`;
                const srcPath = resolve(srcDir, filename);

                if (existsSync(srcPath)) {
                    copyFileSync(srcPath, resolve(destDir, filename));
                }
            }
        },
    };
}

/**
 * Validates no dynamic import() in the background bundle.
 * Service workers cannot use dynamic imports.
 */
function validateNoBackgroundDynamicImport(): Plugin {
    return {
        name: "validate-no-bg-dynamic-import",
        writeBundle() {
            const bgDir = resolve(DIST_DIR, "background");

            if (!existsSync(bgDir)) {
                return;
            }

            const jsFiles = readdirSync(bgDir).filter((f) => f.endsWith(".js"));
            const violations: string[] = [];

            for (const file of jsFiles) {
                const content = readFileSync(resolve(bgDir, file), "utf-8");
                const dynamicImportPattern = /(?<!\w)import\s*\(/g;
                const matches = [...content.matchAll(dynamicImportPattern)];

                if (matches.length > 0) {
                    violations.push(
                        `  ✗ background/${file}: ${matches.length} dynamic import() call(s)`,
                    );
                }
            }

            if (violations.length > 0) {
                throw new Error(
                    [
                        "",
                        "╔══════════════════════════════════════════════════════════════╗",
                        "║  BUILD FAILED: Dynamic import() in background bundle       ║",
                        "╚══════════════════════════════════════════════════════════════╝",
                        "",
                        ...violations,
                        "",
                    ].join("\n"),
                );
            }
        },
    };
}

/** Generates build-meta.json for hot-reload detection. */
function generateBuildMeta(): Plugin {
    return {
        name: "generate-build-meta",
        writeBundle() {
            mkdirSync(DIST_DIR, { recursive: true });

            writeFileSync(
                resolve(DIST_DIR, "build-meta.json"),
                JSON.stringify({
                    buildId: Math.random().toString(36).slice(2, 10),
                    timestamp: new Date().toISOString(),
                    freshStart: true,
                }, null, 2),
            );
        },
    };
}

/**
 * Copies compiled standalone scripts into dist/projects/scripts/{project-name}/.
 * Reads each project's dist/instruction.json for asset metadata.
 * instruction.json is the sole source of truth — script-manifest.json is not required.
 */
function copyProjectScripts(): Plugin {
    return {
        name: "copy-project-scripts",
        writeBundle() { // eslint-disable-line sonarjs/cognitive-complexity -- build plugin with filesystem branching
            const projectsBaseDir = resolve(DIST_DIR, "projects", "scripts");
            mkdirSync(projectsBaseDir, { recursive: true });

            const standaloneDir = resolve(__dirname, "standalone-scripts");
            if (!existsSync(standaloneDir)) return;

            const scriptFolders = readdirSync(standaloneDir, { withFileTypes: true })
                .filter((d) => d.isDirectory());

            let copiedCount = 0;

            for (const folder of scriptFolders) {
                const projectRootDir = resolve(standaloneDir, folder.name);
                const sourceInstructionPath = resolve(projectRootDir, "src", "instruction.ts");
                const instructionPath = resolve(projectRootDir, "dist", "instruction.json");

                if (!existsSync(instructionPath) && existsSync(sourceInstructionPath)) {
                    try {
                        execSync(
                            `node scripts/compile-instruction.mjs "standalone-scripts/${folder.name}"`,
                            { cwd: __dirname, stdio: "inherit" },
                        );
                    } catch (e) {
                        console.warn(`[copy-project-scripts] Failed to compile instruction for ${folder.name}: ${e}`);
                    }
                }

                if (!existsSync(instructionPath)) continue;

                try {
                    const instruction = JSON.parse(readFileSync(instructionPath, "utf-8"));
                    const distDir = resolve(projectRootDir, "dist");

                    // Per-project subfolder
                    const projectDir = resolve(projectsBaseDir, folder.name);
                    mkdirSync(projectDir, { recursive: true });

                    // Copy ALL dist/ artifacts into the project subfolder
                    if (existsSync(distDir)) {
                        const distFiles = readdirSync(distDir).filter(
                            (f) => !f.startsWith("."),
                        );
                        for (const distFile of distFiles) {
                            const src = resolve(distDir, distFile);
                            const dest = resolve(projectDir, distFile);
                            copyFileSync(src, dest);
                            console.log(`[copy-project-scripts]   + ${folder.name}/${distFile}`);
                        }
                    }

                    const declaredAssets = [
                        ...(instruction.assets?.configs ?? []),
                        ...(instruction.assets?.templates ?? []),
                        ...(instruction.assets?.prompts ?? []),
                        ...(instruction.assets?.css ?? []),
                        ...(instruction.assets?.scripts ?? []),
                    ] as Array<{ file: string; key?: string }>;

                    for (const asset of declaredAssets) {
                        const dest = resolve(projectDir, asset.file);
                        if (existsSync(dest)) {
                            continue;
                        }

                        const source = resolveDeclaredAssetSource(
                            projectRootDir,
                            distDir,
                            asset.file,
                            asset.key,
                        );

                        if (!source) {
                            console.warn(`[copy-project-scripts] Missing declared asset for ${folder.name}: ${asset.file}`);
                            continue;
                        }

                        copyFileSync(source, dest);
                        console.log(`[copy-project-scripts]   + ${folder.name}/${asset.file} (declared asset)`);
                    }

                    // Copy instruction.json itself
                    copyFileSync(instructionPath, resolve(projectDir, "instruction.json"));

                    copiedCount++;
                    console.log(`[copy-project-scripts] ✓ ${folder.name} (${instruction.displayName || folder.name} v${instruction.version || "?"})`);
                } catch (e) {
                    console.warn(`[copy-project-scripts] Failed to process ${folder.name}: ${e}`);
                }
            }

            if (copiedCount > 0) {
                console.log(`[copy-project-scripts] Copied ${copiedCount} project(s) to dist/projects/scripts/`);
            }

            // Regenerate seed-manifest.json AFTER emptyOutDir cleanup + project copy.
            // This is the runtime source the background seeder reads.
            try {
                execSync(
                    `node scripts/generate-seed-manifest.mjs --out "${resolve(DIST_DIR, "projects", "seed-manifest.json")}"`,
                    { cwd: __dirname, stdio: "inherit" },
                );
            } catch (e) {
                console.warn("[copy-project-scripts] seed-manifest.json generation failed:", e);
            }
        },
    };
}

/**
 * Copies the existing options page (plain HTML) to dist/.
 * This preserves the current options page until it's migrated to React.
 */
function copyLegacyOptions(): Plugin {
    return {
        name: "copy-legacy-options",
        writeBundle() {
            const srcOptions = resolve(EXT_DIR, "src", "options");
            const destOptions = resolve(DIST_DIR, "src", "options");

            if (!existsSync(srcOptions)) {
                return;
            }

            mkdirSync(destOptions, { recursive: true });

            // The options page is built by the original extension vite config.
            // For this PoC we only need the popup to be React.
            // The options_page manifest path points to the original built location.
        },
    };
}

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

export default defineConfig(({ mode }) => {
    const isDev = mode === "development";

    return {
        base: "./",
        plugins: [
            react(),
            viteStaticCopy({
                targets: [
                    {
                        src: "node_modules/sql.js/dist/sql-wasm.wasm",
                        dest: "wasm",
                    },
                    {
                        src: "dist/prompts/macro-prompts.json",
                        dest: "prompts",
                    },
                ],
            }),
            copyManifest(),
            copyIcons(),
            validateNoBackgroundDynamicImport(),
            generateBuildMeta(),
            copyProjectScripts(),
            visualizer({
                filename: resolve(__dirname, "chrome-extension", "bundle-report.html"),
                template: "treemap",
                gzipSize: true,
                brotliSize: false,
            }) as unknown as Plugin,
        ],
        build: {
            outDir: DIST_DIR,
            emptyOutDir: true,
            sourcemap: mode === 'development' ? 'inline' : false,
            minify: false,
            modulePreload: false,
            rollupOptions: {
                input: {
                    "background/index": resolve(
                        __dirname,
                        "src/background/index.ts",
                    ),
                    "popup/popup": resolve(
                        __dirname,
                        "src/popup/popup.html",
                    ),
                    "options/options": resolve(
                        __dirname,
                        "src/options/options.html",
                    ),
                    "content-scripts/xpath-recorder": resolve(
                        __dirname,
                        "src/content-scripts/xpath-recorder.ts",
                    ),
                    "content-scripts/network-reporter": resolve(
                        __dirname,
                        "src/content-scripts/network-reporter.ts",
                    ),
                    "content-scripts/message-relay": resolve(
                        __dirname,
                        "src/content-scripts/message-relay.ts",
                    ),
                },
                output: {
                    entryFileNames: "[name].js",
                    chunkFileNames: "chunks/[name]-[hash].js",
                    assetFileNames: "assets/[name]-[hash][extname]",
                    manualChunks(id) {
                        // Force ALL modules imported by the background entry
                        // into the background bundle to prevent dynamic import()
                        // in the service worker context.
                        const isBackgroundCode =
                            id.includes("/src/background/");

                        if (isBackgroundCode) {
                            return "background/index";
                        }

                        // Shared modules used by background must also be inlined.
                        const isSharedModule =
                            id.includes("/src/shared/");

                        if (isSharedModule) {
                            return "background/index";
                        }
                    },
                },
            },
        },
        resolve: {
            alias: {
                // Shared React UI and routes use @/ for the root src/ tree.
                "@/": resolve(__dirname, "src") + "/",
                // Extension-only source remains available via @ext/.
                "@ext/": resolve(EXT_DIR, "src") + "/",
                "@root/": resolve(__dirname, "src") + "/",
                "@standalone": resolve(__dirname, "standalone-scripts"),
            },
        },
    };
});
