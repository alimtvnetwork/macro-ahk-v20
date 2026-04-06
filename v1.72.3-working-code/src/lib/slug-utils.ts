/**
 * Project Slug Utilities
 * See: spec/12-chrome-extension/65-developer-docs-and-project-slug.md
 */

/** Generate a URL-safe slug from a project name */
export function slugify(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64) || "project";
}

/** Convert a slug to PascalCase codeName (e.g., "marco-dashboard" → "MarcoDashboard") */
export function toCodeName(slug: string): string {
  return slug
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}

/**
 * SDK namespace path for a project.
 * e.g., RiseupAsiaMacroExt.Projects.MarcoDashboard
 */
export function toSdkNamespace(slugOrCodeName: string): string {
  const codeName = slugOrCodeName.includes("-") ? toCodeName(slugOrCodeName) : slugOrCodeName;
  return `RiseupAsiaMacroExt.Projects.${codeName}`;
}
