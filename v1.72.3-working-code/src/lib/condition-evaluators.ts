/**
 * Condition Evaluators — Spec 21
 *
 * Evaluates condition checks for the automation chain runner.
 * Each evaluator returns true/false for its check type.
 */

import type { ConditionCheck } from "./automation-types";

export async function evaluateCondition(check: ConditionCheck): Promise<boolean> {
  switch (check.type) {
    case "element_exists":
      return !!document.querySelector(check.selector ?? "");

    case "element_absent":
      return !document.querySelector(check.selector ?? "");

    case "kv_equals": {
      const val = await getKvValue(check.key ?? "");
      return val === (check.value ?? "");
    }

    case "kv_exists": {
      const val = await getKvValue(check.key ?? "");
      return val !== null && val !== undefined;
    }

    default:
      return false;
  }
}

/** Read a KV value from the extension's project_kv store via postMessage */
async function getKvValue(key: string): Promise<string | null> {
  return new Promise((resolve) => {
    const id = `cond_kv_${Date.now()}_${Math.random().toString(36).slice(2)}`;

    const handler = (event: MessageEvent) => {
      if (event.data?.type === "KV_GET_RESPONSE" && event.data?.requestId === id) {
        window.removeEventListener("message", handler);
        resolve(event.data?.value ?? null);
      }
    };

    window.addEventListener("message", handler);
    window.postMessage({ type: "KV_GET", key, requestId: id }, "*");

    // Timeout after 3s
    setTimeout(() => {
      window.removeEventListener("message", handler);
      resolve(null);
    }, 3000);
  });
}
