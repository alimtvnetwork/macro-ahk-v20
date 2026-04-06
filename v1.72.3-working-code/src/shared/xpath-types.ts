/**
 * Marco Extension — XPath Recorder Types
 *
 * Shared types for the XPath recording system.
 */

/** A single recorded XPath entry. */
export interface RecordedXPath {
    xpath: string;
    tagName: string;
    text: string;
    timestamp: string;
    strategy: "id" | "testid" | "role-text" | "positional";
}
