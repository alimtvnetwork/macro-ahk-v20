import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Check, X } from "lucide-react";
import type { JsonValue } from "./json-tree-types";

type NewPropertyType = "string" | "number" | "boolean" | "object" | "array";

const DEFAULT_VALUES: Record<NewPropertyType, JsonValue> = {
  string: "",
  number: 0,
  boolean: false,
  object: {},
  array: [],
};

interface AddPropertyButtonProps {
  onAdd: (key: string, value: JsonValue) => void;
}

/** Button that expands into an inline form for adding a new property. */
export function AddPropertyButton({ onAdd }: AddPropertyButtonProps) {
  const [isAdding, setIsAdding] = useState(false);
  const [newKey, setNewKey] = useState("");
  const [newType, setNewType] = useState<NewPropertyType>("string");

  const handleAdd = () => {
    const trimmed = newKey.trim();
    const isKeyEmpty = trimmed === "";
    if (isKeyEmpty) return;

    onAdd(trimmed, DEFAULT_VALUES[newType]);
    setNewKey("");
    setIsAdding(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isEnter = e.key === "Enter";
    if (isEnter) handleAdd();

    const isEscape = e.key === "Escape";
    if (isEscape) setIsAdding(false);
  };

  if (isAdding) {
    return (
      <AddPropertyForm
        newKey={newKey}
        newType={newType}
        onKeyChange={setNewKey}
        onTypeChange={setNewType}
        onKeyDown={handleKeyDown}
        onConfirm={handleAdd}
        onCancel={() => setIsAdding(false)}
      />
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-6 w-6 hover:bg-primary/15 hover:text-primary"
          onClick={() => setIsAdding(true)}
        >
          <Plus className="h-3 w-3" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">Add a new variable</p>
      </TooltipContent>
    </Tooltip>
  );
}

/* ---- Sub-component ---- */

interface AddPropertyFormProps {
  newKey: string;
  newType: NewPropertyType;
  onKeyChange: (key: string) => void;
  onTypeChange: (type: NewPropertyType) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Inline form for entering the key name and type of a new property. */
function AddPropertyForm({
  newKey,
  newType,
  onKeyChange,
  onTypeChange,
  onKeyDown,
  onConfirm,
  onCancel,
}: AddPropertyFormProps) {
  return (
    <div className="flex items-center gap-1">
      <Input
        value={newKey}
        onChange={(e) => onKeyChange(e.target.value)}
        placeholder="key name"
        className="h-6 text-xs w-28 px-1"
        onKeyDown={onKeyDown}
        autoFocus
      />
      <select
        value={newType}
        onChange={(e) => onTypeChange(e.target.value as NewPropertyType)}
        className="h-6 text-[10px] rounded border border-border bg-card px-1"
      >
        <option value="string">string</option>
        <option value="number">number</option>
        <option value="boolean">boolean</option>
        <option value="object">object</option>
        <option value="array">array</option>
      </select>
      <button className="p-0.5" onClick={onConfirm}>
        <Check className="h-3 w-3 text-[hsl(var(--success))]" />
      </button>
      <button className="p-0.5" onClick={onCancel}>
        <X className="h-3 w-3 text-destructive" />
      </button>
    </div>
  );
}
