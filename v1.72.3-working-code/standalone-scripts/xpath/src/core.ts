/**
 * XPath Utilities — Core XPath query functions
 */

import { getLogger } from "./logger";

export function getByXPath(xpath: string): Node | null {
  if (!xpath) {
    getLogger().warn("getByXPath", "XPath is empty or undefined");
    return null;
  }
  try {
    return document.evaluate(xpath, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    getLogger().warn("getByXPath", "XPath evaluation error: " + msg);
    getLogger().warn("getByXPath", "Problematic XPath: " + xpath);
    return null;
  }
}

export function getAllByXPath(xpath: string): Node[] {
  if (!xpath) {
    getLogger().warn("getAllByXPath", "XPath is empty or undefined");
    return [];
  }
  try {
    const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    const nodes: Node[] = [];
    for (let i = 0; i < result.snapshotLength; i++) {
      const item = result.snapshotItem(i);
      if (item) nodes.push(item);
    }
    return nodes;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    getLogger().warn("getAllByXPath", "XPath evaluation error: " + msg);
    getLogger().warn("getAllByXPath", "Problematic XPath: " + xpath);
    return [];
  }
}
