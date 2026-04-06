import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Plus, Pencil, Trash2 } from "lucide-react";
import type { JsonValue, JsonObject, JsonArray } from "./json-tree-types";
import { isObject, generateUniqueKey } from "./json-tree-helpers";

interface TreeNodeActionsProps {
  value: JsonValue;
  path: string[];
  isExpandable: boolean;
  onUpdate: (path: string[], value: JsonValue) => void;
  onDelete: (path: string[]) => void;
  onStartEdit: () => void;
}

/** Action buttons shown on hover for tree nodes. */
export function TreeNodeActions({
  value,
  path,
  isExpandable,
  onUpdate,
  onDelete,
  onStartEdit,
}: TreeNodeActionsProps) {
  const isPrimitive = isExpandable === false;

  return (
    <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
      {isExpandable && (
        <AddChildButton
          value={value}
          path={path}
          onUpdate={onUpdate}
        />
      )}
      {isPrimitive && (
        <EditButton onStartEdit={onStartEdit} />
      )}
      <DeleteButton path={path} onDelete={onDelete} />
    </div>
  );
}

/* ---- Sub-components ---- */

interface AddChildButtonProps {
  value: JsonValue;
  path: string[];
  onUpdate: (path: string[], value: JsonValue) => void;
}

/** Button to add a child property to an object or array. */
function AddChildButton({ value, path, onUpdate }: AddChildButtonProps) {
  const handleAdd = () => {
    const isObj = isObject(value);

    if (isObj) {
      const newKey = generateUniqueKey(value as JsonObject, "newKey");
      onUpdate([...path, newKey], "");
      return;
    }

    const isArr = Array.isArray(value);
    if (isArr) {
      onUpdate(path, [...(value as JsonArray), ""]);
    }
  };

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="p-0.5 rounded hover:bg-primary/10"
          onClick={handleAdd}
        >
          <Plus className="h-3 w-3 text-muted-foreground" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">Add child property</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface EditButtonProps {
  onStartEdit: () => void;
}

/** Button to start editing a primitive value. */
function EditButton({ onStartEdit }: EditButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="p-0.5 rounded hover:bg-primary/10"
          onClick={onStartEdit}
        >
          <Pencil className="h-3 w-3 text-muted-foreground" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">Edit value</p>
      </TooltipContent>
    </Tooltip>
  );
}

interface DeleteButtonProps {
  path: string[];
  onDelete: (path: string[]) => void;
}

/** Button to delete a tree node. */
function DeleteButton({ path, onDelete }: DeleteButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="p-0.5 rounded hover:bg-destructive/10"
          onClick={() => onDelete(path)}
        >
          <Trash2 className="h-3 w-3 text-destructive/70" />
        </button>
      </TooltipTrigger>
      <TooltipContent>
        <p className="text-xs">Delete this property</p>
      </TooltipContent>
    </Tooltip>
  );
}
