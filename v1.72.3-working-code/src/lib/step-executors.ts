/**
 * Step Executors — Spec 21
 *
 * Individual executor functions for each automation step type.
 * All executors are async and throw on failure.
 */

import type {
  StepInjectPrompt, StepClickButton, StepWait,
  StepWaitForElement, StepWaitForText, StepRunScript,
  StepSetKv, StepNotify,
} from "./automation-types";

/* ------------------------------------------------------------------ */
/*  inject_prompt                                                      */
/* ------------------------------------------------------------------ */

export async function executeInjectPrompt(step: StepInjectPrompt): Promise<void> {
  // Use the same postMessage relay as the existing prompt injection system
  return new Promise((resolve, reject) => {
    const id = `inject_${Date.now()}`;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "PROMPT_INJECT_RESPONSE" && event.data?.requestId === id) {
        window.removeEventListener("message", handler);
        if (event.data.success) resolve();
        else reject(new Error(event.data.error ?? "Prompt injection failed"));
      }
    };
    window.addEventListener("message", handler);
    window.postMessage({ type: "INJECT_PROMPT_BY_SLUG", slug: step.slug, requestId: id }, "*");
    setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error(`Timeout injecting prompt "${step.slug}"`));
    }, 10000);
  });
}

/* ------------------------------------------------------------------ */
/*  click_button                                                       */
/* ------------------------------------------------------------------ */

export async function executeClickButton(step: StepClickButton): Promise<void> {
  const el = document.querySelector(step.selector) as HTMLElement | null;
  if (!el) throw new Error(`Element not found: ${step.selector}`);
  if (el instanceof HTMLButtonElement && el.disabled) throw new Error(`Button is disabled: ${step.selector}`);
  el.click();
}

/* ------------------------------------------------------------------ */
/*  wait                                                               */
/* ------------------------------------------------------------------ */

export async function executeWait(step: StepWait, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, step.durationMs);
    signal?.addEventListener("abort", () => {
      clearTimeout(timer);
      reject(new Error("Wait cancelled"));
    });
  });
}

/* ------------------------------------------------------------------ */
/*  wait_for_element                                                   */
/* ------------------------------------------------------------------ */

export async function executeWaitForElement(step: StepWaitForElement, signal?: AbortSignal): Promise<void> {
  const timeout = step.timeoutMs ?? 30000;
  const appear = step.appear !== false;
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (signal?.aborted) { reject(new Error("Cancelled")); return; }
      const exists = !!document.querySelector(step.selector);
      if ((appear && exists) || (!appear && !exists)) { resolve(); return; }
      if (Date.now() - start > timeout) {
        reject(new Error(`Timeout waiting for element ${appear ? "to appear" : "to disappear"}: ${step.selector}`));
        return;
      }
      setTimeout(check, 500);
    };
    check();
  });
}

/* ------------------------------------------------------------------ */
/*  wait_for_text                                                      */
/* ------------------------------------------------------------------ */

export async function executeWaitForText(step: StepWaitForText, signal?: AbortSignal): Promise<void> {
  const timeout = step.timeoutMs ?? 60000;
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const check = () => {
      if (signal?.aborted) { reject(new Error("Cancelled")); return; }
      if (document.body.innerText.includes(step.text)) { resolve(); return; }
      if (Date.now() - start > timeout) {
        reject(new Error(`Timeout waiting for text: "${step.text}"`));
        return;
      }
      setTimeout(check, 1000);
    };
    check();
  });
}

/* ------------------------------------------------------------------ */
/*  run_script                                                         */
/* ------------------------------------------------------------------ */

export async function executeRunScript(step: StepRunScript): Promise<void> {
  return new Promise((resolve, reject) => {
    const id = `run_${Date.now()}`;
    const handler = (event: MessageEvent) => {
      if (event.data?.type === "RUN_SCRIPT_RESPONSE" && event.data?.requestId === id) {
        window.removeEventListener("message", handler);
        if (event.data.success) resolve();
        else reject(new Error(event.data.error ?? "Script execution failed"));
      }
    };
    window.addEventListener("message", handler);
    window.postMessage({ type: "RUN_SCRIPT_BY_SLUG", slug: step.slug, requestId: id }, "*");
    setTimeout(() => {
      window.removeEventListener("message", handler);
      reject(new Error(`Timeout running script "${step.slug}"`));
    }, 30000);
  });
}

/* ------------------------------------------------------------------ */
/*  set_kv                                                             */
/* ------------------------------------------------------------------ */

export async function executeSetKv(step: StepSetKv): Promise<void> {
  window.postMessage({ type: "KV_SET", key: step.key, value: step.value }, "*");
  // Fire-and-forget; KV_SET doesn't need a response
}

/* ------------------------------------------------------------------ */
/*  notify                                                             */
/* ------------------------------------------------------------------ */

export async function executeNotify(step: StepNotify): Promise<void> {
  // Dispatch a custom event that the UI can listen for
  window.dispatchEvent(new CustomEvent("automation-notify", {
    detail: { message: step.message, level: step.level ?? "info" },
  }));
}
