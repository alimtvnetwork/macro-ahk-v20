/** Primitive value returned by sql.js queries. */
type SqlJsValue = string | number | Uint8Array | null;

declare module "sql.js" {
  export interface Statement {
    run(params?: SqlJsValue[]): void;
    bind(params?: SqlJsValue[]): boolean;
    step(): boolean;
    getAsObject(): Record<string, SqlJsValue>;
    free(): void;
  }

  export interface Database {
    run(sql: string, params?: SqlJsValue[]): Database;
    exec(sql: string): QueryExecResult[];
    prepare(sql: string): Statement;
    close(): void;
    export(): Uint8Array;
  }

  export interface QueryExecResult {
    columns: string[];
    values: SqlJsValue[][];
  }

  export interface SqlJsStatic {
    Database: new (data?: ArrayLike<number>) => Database;
  }

  export default function initSqlJs(config?: {
    locateFile?: (file: string) => string;
  }): Promise<SqlJsStatic>;
}