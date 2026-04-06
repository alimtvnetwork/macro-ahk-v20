/**
 * Marco Extension — sql.js Loader (Service Worker Safe)
 *
 * Uses the dist/sql-wasm.js entry directly to avoid service-worker
 * runtime issues from the package-level entrypoint.
 */

import type { SqlJsStatic } from "sql.js";

// @ts-expect-error dist build path may not expose direct TypeScript declaration
import initSqlJsFactory from "sql.js/dist/sql-wasm.js";

interface InitSqlJsConfig {
    wasmBinary: ArrayBuffer;
}

const initSqlJs = initSqlJsFactory as unknown as (config: InitSqlJsConfig) => Promise<SqlJsStatic>;

export default initSqlJs;
