/**
 * LoopEngine — Wraps loop-engine.ts into a class (V2 Phase 02, Step 5)
 *
 * Implements LoopEngineInterface from MacroController.
 * Delegates to existing loop-engine.ts functions — no logic duplication.
 *
 * See: spec/01-app/macrocontroller-ts-migration-v2/02-class-architecture.md
 */

import type { LoopEngineInterface } from './MacroController';
import {
  startLoop,
  stopLoop,
  runCheck,
  runCycle,
  performDirectMove,
  delegateComplete,
  dispatchDelegateSignal,
} from '../loop-engine';
import { setLoopInterval } from '../ui/ui-updaters';
import { state } from '../shared-state';
import { log } from '../logging';

export class LoopEngine implements LoopEngineInterface {

  /** Start the automation loop in a direction (up/down) */
  start(direction?: string): void {
    startLoop(direction || 'down');
  }

  /** Stop the automation loop */
  stop(): void {
    stopLoop();
  }

  /** Run a manual check (workspace + credit detection) */
  check(): any {
    return runCheck();
  }

  /** Set the loop interval in milliseconds */
  setInterval(ms: number): boolean {
    return setLoopInterval(ms);
  }

  /** Whether the loop is currently running */
  isRunning(): boolean {
    return state.running;
  }

  /** Run a single cycle manually */
  runCycle(): void {
    runCycle();
  }

  /** Perform a direct API move in a direction */
  directMove(direction: string): void {
    performDirectMove(direction);
  }

  /** Signal that a delegated move completed */
  delegateComplete(): void {
    delegateComplete();
  }

  /** Dispatch delegate signal via title/clipboard (deprecated AHK) */
  dispatchSignal(direction: string): void {
    dispatchDelegateSignal(direction);
  }
}
