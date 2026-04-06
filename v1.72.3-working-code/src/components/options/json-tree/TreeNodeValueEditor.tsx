import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, X } from "lucide-react";
import type { JsonValue, JsonObject, JsonArray } from "./json-tree-types";
import { isObject, formatPrimitive, parseInputValue } from "./json-tree-helpers";

interface TreeNodeValueEditorProps {
  value: JsonValue;
  isEditing: boolean;
  editValue: string;
  onEditValueChange: (val: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onStartEdit: () => void;
}

/** Displays the value or an inline edit input for primitives. */
export function TreeNodeValueEditor({
  value,
  isEditing,
  editValue,
  onEditValueChange,
  onCommitEdit,
  onCancelEdit,
  onStartEdit,
}: TreeNodeValueEditorProps) {
  const isObj = isObject(value);
  const isArr = Array.isArray(value);
  const isExpandable = isObj || isArr;

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isEnter = e.key === "Enter";
    if (isEnter) onCommitEdit();

    const isEscape = e.key === "Escape";
    if (isEscape) onCancelEdit();
  };

  const isPrimitive = isExpandable === false;
  const isEditingPrimitive = isEditing && isPrimitive;
  if (isEditingPrimitive) {
    return <PrimitiveEditInput
      editValue={editValue}
      onEditValueChange={onEditValueChange}
      onCommitEdit={onCommitEdit}
      onCancelEdit={onCancelEdit}
      onKeyDown={handleKeyDown}
    />;
  }

  return (
    <span className="flex items-center gap-1 flex-1 min-w-0">
      {isExpandable ? (
        <ExpandableSummary value={value} />
      ) : (
        <PrimitiveValueDisplay value={value} onStartEdit={onStartEdit} />
      )}
    </span>
  );
}

/* ---- Sub-components ---- */

interface PrimitiveEditInputProps {
  editValue: string;
  onEditValueChange: (val: string) => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
}

/** Inline input for editing a primitive value. */
function PrimitiveEditInput({
  editValue,
  onEditValueChange,
  onCommitEdit,
  onCancelEdit,
  onKeyDown,
}: PrimitiveEditInputProps) {
  return (
    <span className="flex items-center gap-1 flex-1">
      <Input
        value={editValue}
        onChange={(e) => onEditValueChange(e.target.value)}
        className="h-5 text-xs flex-1 px-1 font-mono"
        onKeyDown={onKeyDown}
        autoFocus
      />
      <button className="p-0.5" onClick={onCommitEdit}>
        <Check className="h-3 w-3 text-[hsl(var(--success))]" />
      </button>
      <button className="p-0.5" onClick={onCancelEdit}>
        <X className="h-3 w-3 text-destructive" />
      </button>
    </span>
  );
}

interface ExpandableSummaryProps {
  value: JsonValue;
}

/** Shows a summary label like "{3 keys}" or "[5 items]". */
function ExpandableSummary({ value }: ExpandableSummaryProps) {
  const isObj = isObject(value);
  const label = isObj
    ? `{${Object.keys(value as JsonObject).length} keys}`
    : `[${(value as JsonArray).length} items]`;

  return (
    <span className="text-[10px] text-muted-foreground">{label}</span>
  );
}

interface PrimitiveValueDisplayProps {
  value: JsonValue;
  onStartEdit: () => void;
}

/** Clickable display of a primitive value. */
function PrimitiveValueDisplay({ value, onStartEdit }: PrimitiveValueDisplayProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="text-xs font-mono text-foreground truncate cursor-pointer hover:text-primary"
          onClick={onStartEdit}
        >
          {formatPrimitive(value)}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">Click to edit value</p>
      </TooltipContent>
    </Tooltip>
  );
}
