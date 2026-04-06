/**
 * Marco Extension — Dependency Graph Resolver
 *
 * Resolves project injection order using topological sort (Kahn's algorithm).
 * Supports transitive dependencies and semver range matching.
 *
 * See: spec/18-marco-sdk-convention.md §Dependency Resolution
 * See: spec/12-chrome-extension/57-project-dependency-system.md
 */

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

export interface ProjectNode {
    id: string;
    name: string;
    version: string;
    isGlobal: boolean;
    dependencies: ProjectDependency[];
}

export interface ProjectDependency {
    projectId: string;
    version: string; // exact, ^major, ~minor
}

export interface ResolutionResult {
    order: string[];        // Project IDs in injection order
    isSuccess: boolean;
    errorMessage?: string;
}

/* ------------------------------------------------------------------ */
/*  Semver Matching                                                    */
/* ------------------------------------------------------------------ */

interface SemverParts {
    major: number;
    minor: number;
    patch: number;
}

function parseSemver(version: string): SemverParts | null {
    const match = version.match(/^(\d+)\.(\d+)\.(\d+)/);
    if (!match) return null;
    return {
        major: parseInt(match[1], 10),
        minor: parseInt(match[2], 10),
        patch: parseInt(match[3], 10),
    };
}

/**
 * Check if `actual` satisfies the `range` constraint.
 * - `^1.0.0` → >=1.0.0 <2.0.0
 * - `~1.2.0` → >=1.2.0 <1.3.0
 * - `1.5.0`  → exact match
 */
export function satisfiesVersion(actual: string, range: string): boolean {
    const isCaretRange = range.startsWith("^");
    const isTildeRange = range.startsWith("~");
    const cleanRange = range.replace(/^[~^]/, "");

    const actualParts = parseSemver(actual);
    const rangeParts = parseSemver(cleanRange);

    if (!actualParts || !rangeParts) return actual === range;

    const isGteRange =
        actualParts.major > rangeParts.major ||
        (actualParts.major === rangeParts.major && actualParts.minor > rangeParts.minor) ||
        (actualParts.major === rangeParts.major && actualParts.minor === rangeParts.minor && actualParts.patch >= rangeParts.patch);

    if (!isGteRange) return false;

    if (isCaretRange) {
        return actualParts.major === rangeParts.major;
    }

    if (isTildeRange) {
        return actualParts.major === rangeParts.major && actualParts.minor === rangeParts.minor;
    }

    // Exact match
    return actualParts.major === rangeParts.major &&
        actualParts.minor === rangeParts.minor &&
        actualParts.patch === rangeParts.patch;
}

/* ------------------------------------------------------------------ */
/*  Topological Sort (Kahn's Algorithm)                                */
/* ------------------------------------------------------------------ */

/**
 * Resolves injection order for a set of projects.
 * Returns projects in dependency-first order (shared/global projects first).
 */
export function resolveInjectionOrder(projects: ProjectNode[]): ResolutionResult {
    const projectMap = new Map<string, ProjectNode>();
    for (const p of projects) {
        projectMap.set(p.id, p);
    }

    // Build adjacency list and in-degree count
    const adjacency = new Map<string, Set<string>>();
    const inDegree = new Map<string, number>();

    for (const p of projects) {
        if (!adjacency.has(p.id)) adjacency.set(p.id, new Set());
        if (!inDegree.has(p.id)) inDegree.set(p.id, 0);

        for (const dep of p.dependencies) {
            const depProject = projectMap.get(dep.projectId);
            if (!depProject) {
                return {
                    order: [],
                    isSuccess: false,
                    errorMessage: `Project "${p.id}" depends on unknown project "${dep.projectId}"`,
                };
            }

            const isVersionSatisfied = satisfiesVersion(depProject.version, dep.version);
            if (!isVersionSatisfied) {
                return {
                    order: [],
                    isSuccess: false,
                    errorMessage: `Version mismatch: "${p.id}" requires "${dep.projectId}@${dep.version}" but found "${depProject.version}"`,
                };
            }

            // dep.projectId → p.id (dep must be injected before p)
            if (!adjacency.has(dep.projectId)) adjacency.set(dep.projectId, new Set());
            adjacency.get(dep.projectId)!.add(p.id);

            inDegree.set(p.id, (inDegree.get(p.id) ?? 0) + 1);
            if (!inDegree.has(dep.projectId)) inDegree.set(dep.projectId, 0);
        }
    }

    // Kahn's algorithm
    const queue: string[] = [];
    for (const [id, degree] of inDegree) {
        if (degree === 0) queue.push(id);
    }

    // Stable sort: global projects first among zero-degree nodes
    queue.sort((a, b) => {
        const aGlobal = projectMap.get(a)?.isGlobal ? 0 : 1;
        const bGlobal = projectMap.get(b)?.isGlobal ? 0 : 1;
        return aGlobal - bGlobal;
    });

    const order: string[] = [];

    while (queue.length > 0) {
        const current = queue.shift()!;
        order.push(current);

        const neighbors = adjacency.get(current) ?? new Set();
        for (const neighbor of neighbors) {
            const newDegree = (inDegree.get(neighbor) ?? 1) - 1;
            inDegree.set(neighbor, newDegree);

            if (newDegree === 0) {
                queue.push(neighbor);
            }
        }
    }

    const hasCircularDependency = order.length !== projects.length;
    if (hasCircularDependency) {
        const missing = projects
            .filter((p) => !order.includes(p.id))
            .map((p) => p.id);
        return {
            order: [],
            isSuccess: false,
            errorMessage: `Circular dependency detected involving: ${missing.join(", ")}`,
        };
    }

    return { order, isSuccess: true };
}
