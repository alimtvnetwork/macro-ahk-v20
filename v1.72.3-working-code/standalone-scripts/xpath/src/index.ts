/**
 * XPath Utilities — Global Standalone Script
 * 
 * Entry point. Builds as IIFE exposing window.XPathUtils.
 * Self-contained: no external dependencies.
 */

import { getByXPath, getAllByXPath } from "./core";
import { findElement } from "./find-element";
import { reactClick } from "./react-click";
import { setLogger } from "./logger";

const VERSION = "1.0.0";

const XPathUtils = {
  version: VERSION,
  setLogger,
  getByXPath,
  getAllByXPath,
  findElement,
  reactClick,
};

(window as unknown as { XPathUtils: typeof XPathUtils }).XPathUtils = XPathUtils;

export { getByXPath, getAllByXPath, findElement, reactClick, setLogger };
export type { ElementDescriptor } from "./find-element";
