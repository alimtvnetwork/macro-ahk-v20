/**
 * Automation Chain Types — Spec 21
 *
 * Defines all step types, chain definitions, triggers,
 * and execution state for the advanced automation system.
 */

/* ------------------------------------------------------------------ */
/*  Step Types                                                         */
/* ------------------------------------------------------------------ */

export interface StepInjectPrompt {
  type: "inject_prompt";
  slug: string;
}

export interface StepClickButton {
  type: "click_button";
  selector: string;
}

export interface StepWait {
  type: "wait";
  durationMs: number;
}

export interface StepWaitForElement {
  type: "wait_for_element";
  selector: string;
  /** Wait for appear (true) or disappear (false). Default: true */
  appear?: boolean;
  timeoutMs?: number;
}

export interface StepWaitForText {
  type: "wait_for_text";
  text: string;
  timeoutMs?: number;
}

export interface StepRunScript {
  type: "run_script";
  slug: string;
}

export interface StepSetKv {
  type: "set_kv";
  key: string;
  value: string;
}

export interface StepNotify {
  type: "notify";
  message: string;
  level?: "info" | "success" | "warning" | "error";
}

export interface ConditionCheck {
  type: "element_exists" | "element_absent" | "kv_equals" | "kv_exists";
  selector?: string;
  key?: string;
  value?: string;
}

export interface StepCondition {
  type: "condition";
  check: ConditionCheck;
  then: ChainStep[];
  else: ChainStep[];
}

export type ChainStep =
  | StepInjectPrompt
  | StepClickButton
  | StepWait
  | StepWaitForElement
  | StepWaitForText
  | StepRunScript
  | StepSetKv
  | StepNotify
  | StepCondition;

/* ------------------------------------------------------------------ */
/*  Trigger Types                                                      */
/* ------------------------------------------------------------------ */

export type TriggerType = "manual" | "on_page_load" | "on_element" | "interval" | "cron";

export interface TriggerConfig {
  /** URL pattern for on_page_load */
  urlPattern?: string;
  /** CSS selector for on_element */
  elementSelector?: string;
  /** Minutes for interval trigger */
  intervalMinutes?: number;
  /** Max run count for interval */
  maxRuns?: number;
  /** Cron expression for cron trigger */
  cronExpression?: string;
}

/* ------------------------------------------------------------------ */
/*  Chain Definition                                                   */
/* ------------------------------------------------------------------ */

export interface AutomationChain {
  id: string;
  projectId: string;
  name: string;
  slug: string;
  steps: ChainStep[];
  triggerType: TriggerType;
  triggerConfig?: TriggerConfig;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/* ------------------------------------------------------------------ */
/*  Execution State                                                    */
/* ------------------------------------------------------------------ */

export type StepStatus = "pending" | "running" | "done" | "error" | "skipped";

export type ChainRunnerStatus = "idle" | "running" | "paused" | "completed" | "error" | "cancelled";

export interface FlattenedStep {
  step: ChainStep;
  depth: number;
  branchLabel?: "then" | "else";
}

export interface ChainExecutionState {
  chainId: string;
  chainName: string;
  status: ChainRunnerStatus;
  flatSteps: FlattenedStep[];
  stepStatuses: StepStatus[];
  currentStepIndex: number;
  error?: string;
  startedAt?: string;
  completedAt?: string;
}

/* ------------------------------------------------------------------ */
/*  Step metadata for UI                                               */
/* ------------------------------------------------------------------ */

export const STEP_TYPE_META: Record<ChainStep["type"], { label: string; icon: string; color: string }> = {
  inject_prompt: { label: "Inject Prompt", icon: "💬", color: "text-blue-500" },
  click_button: { label: "Click Button", icon: "🖱", color: "text-orange-500" },
  wait: { label: "Wait", icon: "⏱", color: "text-muted-foreground" },
  wait_for_element: { label: "Wait for Element", icon: "👁", color: "text-purple-500" },
  wait_for_text: { label: "Wait for Text", icon: "⏳", color: "text-purple-500" },
  run_script: { label: "Run Script", icon: "⚡", color: "text-yellow-500" },
  set_kv: { label: "Set KV", icon: "💾", color: "text-green-500" },
  notify: { label: "Notify", icon: "🔔", color: "text-primary" },
  condition: { label: "Condition", icon: "🔀", color: "text-amber-500" },
};

/** Default empty step factories */
export function createDefaultStep(type: ChainStep["type"]): ChainStep {
  switch (type) {
    case "inject_prompt": return { type: "inject_prompt", slug: "" };
    case "click_button": return { type: "click_button", selector: "" };
    case "wait": return { type: "wait", durationMs: 1000 };
    case "wait_for_element": return { type: "wait_for_element", selector: "", appear: true, timeoutMs: 30000 };
    case "wait_for_text": return { type: "wait_for_text", text: "", timeoutMs: 60000 };
    case "run_script": return { type: "run_script", slug: "" };
    case "set_kv": return { type: "set_kv", key: "", value: "" };
    case "notify": return { type: "notify", message: "", level: "info" };
    case "condition": return { type: "condition", check: { type: "element_exists", selector: "" }, then: [], else: [] };
  }
}

/** Flatten nested steps (conditions) into a linear list for display */
export function flattenSteps(steps: ChainStep[], depth = 0): FlattenedStep[] {
  const result: FlattenedStep[] = [];
  for (const step of steps) {
    result.push({ step, depth });
    if (step.type === "condition") {
      for (const s of step.then) result.push({ step: s, depth: depth + 1, branchLabel: "then" });
      for (const s of step.else) result.push({ step: s, depth: depth + 1, branchLabel: "else" });
    }
  }
  return result;
}
