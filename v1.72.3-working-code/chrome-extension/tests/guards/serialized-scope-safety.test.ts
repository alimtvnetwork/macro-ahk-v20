/**
 * Marco Extension — Serialized Function Scope Safety Test
 *
 * Functions passed to chrome.scripting.executeScript's `func` parameter
 * are serialized and run in a separate page context. They CANNOT reference
 * any sibling functions, module imports, or external variables.
 *
 * This test statically verifies that every named function passed as `func:`
 * does not call any other named functions from the same file that are NOT
 * defined inside its own body.
 */

import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const SRC_DIR = path.resolve(__dirname, "..", "..", "src");

/** Recursively find all .ts files under a directory. */
function findTsFiles(dir: string): string[] {
    const results: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory() && entry.name !== "node_modules") {
            results.push(...findTsFiles(fullPath));
        } else if (entry.isFile() && /\.tsx?$/.test(entry.name)) {
            results.push(fullPath);
        }
    }
    return results;
}

/** Extract all top-level function names from file content. */
function extractTopLevelFunctions(content: string): string[] {
    const functionPattern = /^(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm;
    const names: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = functionPattern.exec(content)) !== null) {
        names.push(match[1]);
    }
    return names;
}

/** Extract function names passed as `func:` to executeScript. */
function extractSerializedFuncNames(content: string): string[] {
    // Matches: func: someFunctionName  (with optional trailing comma)
    const pattern = /func:\s*(\w+)/g;
    const names: string[] = [];
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
        const name = match[1];
        // Skip arrow functions captured inline and built-in keywords
        if (name !== "async" && name !== "function") {
            names.push(name);
        }
    }
    return names;
}

/** Extract the full body of a named function from file content. */
function extractFunctionBody(content: string, funcName: string): string | null {
    // Find the function declaration
    const declPattern = new RegExp(
        `(?:export\\s+)?(?:async\\s+)?function\\s+${funcName}\\s*\\([^)]*\\)[^{]*\\{`,
    );
    const match = declPattern.exec(content);
    if (match === null) return null;

    // Walk braces to find the end of the function
    let depth = 1;
    let i = match.index + match[0].length;
    while (i < content.length && depth > 0) {
        if (content[i] === "{") depth++;
        else if (content[i] === "}") depth--;
        i++;
    }

    return content.slice(match.index + match[0].length, i - 1);
}

interface Violation {
    file: string;
    serializedFunc: string;
    referencedSiblings: string[];
}

describe("Serialized executeScript functions — scope safety", () => {
    it("should not reference sibling functions from the same file", () => {
        const tsFiles = findTsFiles(path.join(SRC_DIR, "background"));
        const violations: Violation[] = [];

        for (const filePath of tsFiles) {
            const content = fs.readFileSync(filePath, "utf-8");

            // Skip files that don't use executeScript
            if (!content.includes("executeScript")) continue;

            const serializedFuncNames = extractSerializedFuncNames(content);
            if (serializedFuncNames.length === 0) continue;

            const allTopLevelFunctions = extractTopLevelFunctions(content);

            for (const funcName of serializedFuncNames) {
                const body = extractFunctionBody(content, funcName);
                if (body === null) continue; // inline arrow or not found in this file

                // Find sibling functions (top-level functions that are NOT this function)
                const siblings = allTopLevelFunctions.filter((n) => n !== funcName);

                // Check if the function body calls any sibling
                const referencedSiblings = siblings.filter((sibling) => {
                    // Match as a word boundary call: siblingName(
                    const callPattern = new RegExp(`\\b${sibling}\\s*\\(`);
                    return callPattern.test(body);
                });

                if (referencedSiblings.length > 0) {
                    const relPath = path.relative(
                        path.resolve(__dirname, "..", ".."),
                        filePath,
                    );
                    violations.push({
                        file: relPath,
                        serializedFunc: funcName,
                        referencedSiblings,
                    });
                }
            }
        }

        if (violations.length > 0) {
            const report = violations
                .map(
                    (v) =>
                        `  ✘ ${v.file}: ${v.serializedFunc}() references sibling(s): ${v.referencedSiblings.join(", ")}\n` +
                        `    Functions passed to chrome.scripting.executeScript must be fully self-contained.`,
                )
                .join("\n\n");

            expect.fail(
                `Found ${violations.length} serialized function(s) with out-of-scope references:\n\n${report}`,
            );
        }
    });
});
