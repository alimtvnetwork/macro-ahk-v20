/**
 * XPath Utilities — Internal logger
 * Decoupled so core modules can log without circular imports.
 */

type LogFn = (fn: string, msg: string) => void;

let _log: LogFn = () => {};
let _logSub: LogFn = () => {};
let _warn: LogFn = () => {};

export function setLogger(log: LogFn, logSub: LogFn, warn: LogFn): void {
  _log = log;
  _logSub = logSub;
  _warn = warn;
}

export function getLogger() {
  return { log: _log, logSub: _logSub, warn: _warn };
}
