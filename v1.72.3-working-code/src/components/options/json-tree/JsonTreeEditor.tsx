import { useCallback } from "react";
import { Button } from "@/components/ui/button";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { JsonObject, JsonValue } from "./json-tree-types";
import {
  safeParse,
  isObject,
  setNestedValue,
  deleteNestedKey,
  renameNestedKey,
} from "./json-tree-helpers";
import { ObjectNodes } from "./ObjectNodes";
import { AddPropertyButton } from "./AddPropertyButton";

interface Props {
  value: string;
  onChange: (json: string) => void;
}

/** Root component for the JSON tree variable editor. */
export function JsonTreeEditor({ value, onChange }: Props) {
  const parsed = safeParse(value);
  const isValidRoot = isObject(parsed);

  const handleUpdate = useCallback(
    (newRoot: JsonObject) => {
      onChange(JSON.stringify(newRoot, null, 2));
    },
    [onChange],
  );

  const isInvalidRoot = !isValidRoot;
  if (isInvalidRoot) {
    return <InvalidRootMessage onReset={() => onChange("{}")} />;
  }

  const rootObj = parsed as JsonObject;

  const handleValueUpdate = (path: string[], val: JsonValue) => {
    handleUpdate(setNestedValue(rootObj, path, val));
  };

  const handleDelete = (path: string[]) => {
    handleUpdate(deleteNestedKey(rootObj, path));
  };

  const handleRename = (path: string[], newKey: string) => {
    handleUpdate(renameNestedKey(rootObj, path, newKey));
  };

  const handleAddProperty = (key: string, val: JsonValue) => {
    handleUpdate({ ...rootObj, [key]: val });
  };

  const hasEntries = Object.keys(rootObj).length > 0;

  return (
    <TooltipProvider delayDuration={200}>
      <div className="rounded-md border border-border bg-card">
        <TreeEditorHeader onAdd={handleAddProperty} />
        <div className="p-1">
          {hasEntries ? (
            <ObjectNodes
              obj={rootObj}
              path={[]}
              onUpdate={handleValueUpdate}
              onDelete={handleDelete}
              onRename={handleRename}
            />
          ) : (
            <EmptyStateMessage />
          )}
        </div>
      </div>
    </TooltipProvider>
  );
}

/* ---- Sub-components ---- */

interface InvalidRootMessageProps {
  onReset: () => void;
}

/** Error message when the JSON root is not a valid object. */
function InvalidRootMessage({ onReset }: InvalidRootMessageProps) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3">
      <p className="text-xs text-destructive">
        Invalid JSON root — must be an object {"{ }"}. Fix manually or clear to reset.
      </p>
      <Button size="sm" variant="outline" className="mt-2" onClick={onReset}>
        Reset to empty object
      </Button>
    </div>
  );
}

interface TreeEditorHeaderProps {
  onAdd: (key: string, val: JsonValue) => void;
}

/** Header bar with title and add-property button. */
function TreeEditorHeader({ onAdd }: TreeEditorHeaderProps) {
  return (
    <div className="flex items-center justify-between px-3 py-2 border-b border-border bg-muted/30">
      <span className="text-xs font-medium text-foreground">Variables (JSON)</span>
      <AddPropertyButton onAdd={onAdd} />
    </div>
  );
}

/** Placeholder when no variables exist. */
function EmptyStateMessage() {
  return (
    <p className="text-xs text-muted-foreground py-4 text-center">
      No variables yet. Click "+" to add one.
    </p>
  );
}
