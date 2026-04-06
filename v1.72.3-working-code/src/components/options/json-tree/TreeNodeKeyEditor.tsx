import { useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Check, X } from "lucide-react";

interface TreeNodeKeyEditorProps {
  nodeKey: string;
  isRenamingKey: boolean;
  onStartRename: () => void;
  onCommitRename: (newKey: string) => void;
  onCancelRename: () => void;
}

/** Inline editor for renaming a tree node key. */
export function TreeNodeKeyEditor({
  nodeKey,
  isRenamingKey,
  onStartRename,
  onCommitRename,
  onCancelRename,
}: TreeNodeKeyEditorProps) {
  const [renameValue, setRenameValue] = useState(nodeKey);

  const handleCommit = () => {
    onCommitRename(renameValue.trim());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    const isEnter = e.key === "Enter";
    if (isEnter) handleCommit();

    const isEscape = e.key === "Escape";
    if (isEscape) onCancelRename();
  };

  if (isRenamingKey) {
    return (
      <span className="flex items-center gap-1">
        <Input
          value={renameValue}
          onChange={(e) => setRenameValue(e.target.value)}
          className="h-5 text-xs w-24 px-1"
          onKeyDown={handleKeyDown}
          autoFocus
        />
        <button className="p-0.5" onClick={handleCommit}>
          <Check className="h-3 w-3 text-[hsl(var(--success))]" />
        </button>
        <button className="p-0.5" onClick={onCancelRename}>
          <X className="h-3 w-3 text-destructive" />
        </button>
      </span>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          className="text-xs font-medium text-primary cursor-pointer hover:underline"
          onClick={onStartRename}
        >
          {nodeKey}
        </button>
      </TooltipTrigger>
      <TooltipContent side="top">
        <p className="text-xs">Click to rename key</p>
      </TooltipContent>
    </Tooltip>
  );
}
