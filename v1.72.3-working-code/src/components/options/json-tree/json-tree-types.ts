/** Primitive or nested JSON value. */
export type JsonValue = string | number | boolean | null | JsonObject | JsonArray;

/** JSON object with string keys. */
export type JsonObject = { [key: string]: JsonValue };

/** JSON array of values. */
export type JsonArray = JsonValue[];

/** Represents a single node in the tree. */
export interface TreeNode {
  key: string;
  value: JsonValue;
  path: string[];
}

/** Callback for updating a value at a given path. */
export type OnUpdateHandler = (path: string[], value: JsonValue) => void;

/** Callback for deleting a key at a given path. */
export type OnDeleteHandler = (path: string[]) => void;

/** Callback for renaming a key at a given path. */
export type OnRenameHandler = (path: string[], newKey: string) => void;
