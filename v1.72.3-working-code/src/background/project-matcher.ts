/**
 * Marco Extension — Project Matcher
 *
 * Evaluates all enabled projects against a URL to determine
 * which scripts should be injected. Returns matched rules
 * sorted by priority with deduplication.
 * See spec 12-project-model-and-url-rules.md §URL Matching Logic.
 */

import type { StoredProject } from "../shared/project-types";
import type { MatchResult, ScriptBindingResolved } from "../shared/types";
import { isUrlMatch } from "./url-matcher";
import { readAllProjects } from "./handlers/project-helpers";

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */

/** Evaluates a URL against all enabled projects (excludes dependency-only projects). */
export async function evaluateUrlMatches(
    url: string,
): Promise<MatchResult[]> {
    const projects = await readAllProjects();
    const enabledProjects = projects
        .filter(isProjectEnabled)
        .filter(isNotDependencyOnly);
    const allMatches = collectAllMatches(enabledProjects, url);
    const sortedMatches = sortByPriority(allMatches);

    return sortedMatches;
}

/* ------------------------------------------------------------------ */
/*  Matching Logic                                                     */
/* ------------------------------------------------------------------ */

/** Collects matches from all enabled projects. */
function collectAllMatches(
    projects: StoredProject[],
    url: string,
): MatchResult[] {
    const matches: MatchResult[] = [];

    for (const project of projects) {
        const projectMatches = matchProjectRules(project, url);
        matches.push(...projectMatches);
    }

    return matches;
}

/** Matches a single project's URL rules against a URL. */
function matchProjectRules(
    project: StoredProject,
    url: string,
): MatchResult[] {
    const matches: MatchResult[] = [];

    for (const rule of project.targetUrls) {
        const isMatch = isUrlMatch(url, rule);

        if (isMatch) {
            const matchResult = buildMatchResult(project, rule);
            matches.push(matchResult);
        }
    }

    return matches;
}

/** Builds a MatchResult from a project and matched rule. */
function buildMatchResult(
    project: StoredProject,
    rule: StoredProject["targetUrls"][0],
): MatchResult {
    const scriptBindings = buildScriptBindings(project);

    return {
        projectId: project.id,
        projectName: project.name,
        ruleId: `${project.id}:${rule.pattern}`,
        ruleName: rule.pattern,
        priority: 100,
        scriptBindings,
        conditions: {
            requireElement: null,
            requireCookie: null,
            minDelayMs: 0,
            requireOnline: false,
        },
    };
}

/** Converts project scripts to resolved script bindings. */
function buildScriptBindings(
    project: StoredProject,
): ScriptBindingResolved[] {
    return project.scripts.map((script) => ({
        scriptId: script.path,
        configId: script.configBinding ?? null,
        order: script.order,
        world: "MAIN" as const,
        runAt: script.runAt ?? "document_idle",
    }));
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Returns true if a project has scripts defined. */
function isProjectEnabled(project: StoredProject): boolean {
    const hasScripts = project.scripts.length > 0;
    const hasRules = project.targetUrls.length > 0;

    return hasScripts && hasRules;
}

/** Returns true if the project is NOT restricted to dependency-only execution. */
function isNotDependencyOnly(project: StoredProject): boolean {
    return project.settings?.onlyRunAsDependency !== true;
}

/** Sorts matches by priority (lower number = higher priority). */
function sortByPriority(matches: MatchResult[]): MatchResult[] {
    return [...matches].sort((a, b) => a.priority - b.priority);
}

/* ------------------------------------------------------------------ */
/*  Deduplication                                                      */
/* ------------------------------------------------------------------ */

/** Deduplicates script bindings across multiple matches. */
export function deduplicateScripts(
    matches: MatchResult[],
): ScriptBindingResolved[] {
    const seenScriptIds = new Set<string>();
    const deduplicated: ScriptBindingResolved[] = [];

    for (const match of matches) {
        for (const binding of match.scriptBindings) {
            const isDuplicate = seenScriptIds.has(binding.scriptId);

            if (isDuplicate) {
                continue;
            }

            seenScriptIds.add(binding.scriptId);
            deduplicated.push(binding);
        }
    }

    return deduplicated;
}
