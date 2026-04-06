/**
 * XPath Utilities — React-compatible click dispatcher
 */

import { getLogger } from "./logger";

export function reactClick(el: Element, callerXpath?: string): void {
  const { log, logSub } = getLogger();
  const tag = "<" + el.tagName.toLowerCase() +
    ((el as HTMLElement).id ? "#" + (el as HTMLElement).id : "") + ">";

  log("reactClick", "Clicking " + tag + " | XPath: " + (callerXpath || "(no xpath)"));

  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const mouseOpts: MouseEventInit = {
    view: window,
    bubbles: true,
    cancelable: true,
    button: 0,
    buttons: 1,
    clientX: cx,
    clientY: cy,
  };

  const pointerOpts: PointerEventInit = {
    ...mouseOpts,
    pointerId: 1,
    pointerType: "mouse" as const,
    isPrimary: true,
  };

  el.dispatchEvent(new PointerEvent("pointerdown", pointerOpts));
  el.dispatchEvent(new MouseEvent("mousedown", mouseOpts));
  el.dispatchEvent(new PointerEvent("pointerup", pointerOpts));
  el.dispatchEvent(new MouseEvent("mouseup", mouseOpts));
  el.dispatchEvent(new MouseEvent("click", mouseOpts));

  logSub("reactClick", "All 5 events dispatched");
}
