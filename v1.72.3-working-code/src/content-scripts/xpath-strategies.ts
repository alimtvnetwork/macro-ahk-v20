/**
 * Marco Extension — XPath Strategy Helpers
 *
 * Priority-based XPath generation strategies.
 * Split from xpath-recorder.ts to stay under 200 lines.
 *
 * Canonical source — chrome-extension/src/content-scripts/ re-exports from here.
 */

/* ------------------------------------------------------------------ */
/*  Strategy 1: ID                                                     */
/* ------------------------------------------------------------------ */

/** Strategy 1: Element has an id attribute. */
export function tryIdStrategy(element: Element): {
    xpath: string;
    strategy: "id";
} | null {
    const id = element.getAttribute("id");
    const hasValidId = id !== null && id !== "";

    return hasValidId
        ? { xpath: `//*[@id="${id}"]`, strategy: "id" }
        : null;
}

/* ------------------------------------------------------------------ */
/*  Strategy 2: data-testid                                            */
/* ------------------------------------------------------------------ */

/** Strategy 2: Element has a data-testid attribute. */
export function tryTestIdStrategy(element: Element): {
    xpath: string;
    strategy: "testid";
} | null {
    const testId = element.getAttribute("data-testid");
    const hasTestId = testId !== null && testId !== "";

    return hasTestId
        ? { xpath: `//*[@data-testid="${testId}"]`, strategy: "testid" }
        : null;
}

/* ------------------------------------------------------------------ */
/*  Strategy 3: Role + Text                                            */
/* ------------------------------------------------------------------ */

/** Strategy 3: Element has a role + visible text. */
export function tryRoleTextStrategy(element: Element): {
    xpath: string;
    strategy: "role-text";
} | null {
    const role = element.getAttribute("role");
    const text = element.textContent?.trim().slice(0, 50) ?? "";
    const hasRoleAndText = role !== null && role !== "" && text !== "";

    return hasRoleAndText
        ? { xpath: `//*[@role="${role}"][contains(text(),"${text}")]`, strategy: "role-text" }
        : null;
}

/* ------------------------------------------------------------------ */
/*  Strategy 4: Positional                                             */
/* ------------------------------------------------------------------ */

/** Strategy 4: Build positional XPath by walking up the DOM. */
export function buildPositionalXPath(element: Element): {
    xpath: string;
    strategy: "positional";
} {
    const segments: string[] = [];
    let current: Element | null = element;

    while (current !== null && current !== document.documentElement) {
        const segment = buildSegment(current);
        segments.unshift(segment);
        current = current.parentElement;
    }

    return {
        xpath: "/" + segments.join("/"),
        strategy: "positional",
    };
}

/** Builds a single positional segment like "div[3]". */
function buildSegment(element: Element): string {
    const tagName = element.tagName.toLowerCase();
    const parent = element.parentElement;
    const hasParent = parent !== null;

    if (hasParent) {
        const siblings = Array.from(parent!.children).filter(
            (c) => c.tagName === element.tagName,
        );
        const hasSiblings = siblings.length > 1;

        if (hasSiblings) {
            const index = siblings.indexOf(element) + 1;
            return `${tagName}[${index}]`;
        }
    }

    return tagName;
}
