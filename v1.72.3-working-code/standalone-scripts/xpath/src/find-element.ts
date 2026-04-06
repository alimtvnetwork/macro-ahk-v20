/**
 * XPath Utilities — Generic findElement with multi-method fallback
 */

import { getByXPath } from "./core";
import { getLogger } from "./logger";

export interface ElementDescriptor {
  name?: string;
  xpath?: string;
  textMatch?: string | string[];
  tag?: string;
  selector?: string | string[];
  role?: string;
  ariaLabel?: string | string[];
}

export function findElement(descriptor: ElementDescriptor): Element | null {
  const name = descriptor.name || "unknown";
  const { log, warn } = getLogger();

  log("findElement", 'Searching for "' + name + '"');

  if (descriptor.xpath) {
    log("findElement", "  Method 1 (XPath): " + descriptor.xpath);
    const xpathResult = getByXPath(descriptor.xpath);
    if (xpathResult) {
      log("findElement", "  " + name + " FOUND via XPath");
      return xpathResult as Element;
    }
    warn("findElement", "  " + name + " XPath failed — trying fallbacks");
  }

  if (descriptor.textMatch) {
    const tag = descriptor.tag || "button";
    const texts = Array.isArray(descriptor.textMatch) ? descriptor.textMatch : [descriptor.textMatch];
    log("findElement", "  Method 2 (text scan): <" + tag + "> for " + JSON.stringify(texts));
    const allTags = document.querySelectorAll(tag);
    for (let t = 0; t < allTags.length; t++) {
      const elText = (allTags[t].textContent || "").trim();
      for (let m = 0; m < texts.length; m++) {
        if (elText === texts[m] || elText.indexOf(texts[m]) !== -1) {
          log("findElement", "  " + name + ' FOUND via text: "' + elText.substring(0, 40) + '"');
          return allTags[t];
        }
      }
    }
  }

  if (descriptor.selector) {
    const selectors = Array.isArray(descriptor.selector) ? descriptor.selector : [descriptor.selector];
    log("findElement", "  Method 3 (CSS selector): " + selectors.length + " selectors");
    for (let s = 0; s < selectors.length; s++) {
      try {
        const sResult = document.querySelector(selectors[s]);
        if (sResult) {
          log("findElement", "  FOUND via selector: " + selectors[s]);
          return sResult;
        }
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        warn("findElement", "  Invalid selector: " + msg);
      }
    }
  }

  if (descriptor.ariaLabel || descriptor.role) {
    log("findElement", "  Method 4 (ARIA/role)");
    if (descriptor.ariaLabel) {
      const ariaLabels = Array.isArray(descriptor.ariaLabel) ? descriptor.ariaLabel : [descriptor.ariaLabel];
      for (let a = 0; a < ariaLabels.length; a++) {
        try {
          const ariaResult = document.querySelector(
            '[aria-label*="' + ariaLabels[a] + '" i], [title*="' + ariaLabels[a] + '" i]'
          );
          if (ariaResult) {
            log("findElement", "  " + name + " FOUND via ARIA: " + ariaLabels[a]);
            return ariaResult;
          }
        } catch { /* skip */ }
      }
    }
    if (descriptor.role) {
      const roleResult = document.querySelector('[role="' + descriptor.role + '"]');
      if (roleResult) {
        log("findElement", "  " + name + " FOUND via role: " + descriptor.role);
        return roleResult;
      }
    }
  }

  warn("findElement", '  All methods failed for "' + name + '"');
  return null;
}
