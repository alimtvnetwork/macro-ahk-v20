import { useState } from "react";
import { ChevronRight, ChevronDown } from "lucide-react";
import type { JsonValue, JsonObject, JsonArray, OnUpdateHandler, OnDeleteHandler, OnRenameHandler } from "./json-tree-types";
import { isObject, isPrimitive, parseInputValue } from "./json-tree-helpers";
import { TypeIcon } from "./TypeIcon";
import { TreeNodeKeyEditor } from "./TreeNodeKeyEditor";
import { TreeNodeValueEditor } from "./TreeNodeValueEditor";
import { TreeNodeActions } from "./TreeNodeActions";
import { ObjectNodes } from "./ObjectNodes";

interface TreeNodeRowProps {
  nodeKey: string;
  value: JsonValue;
  path: string[];
  onUpdate: OnUpdateHandler;
  onDelete: OnDeleteHandler;
  onRename: OnRenameHandler;
}

/** Renders a single row in the JSON tree with expand/collapse, edit, and actions. */
export function TreeNodeRow({
  nodeKey,
  value,
  path,
  onUpdate,
  onDelete,
  onRename,
}: TreeNodeRowProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState("");
  const [isRenamingKey, setIsRenamingKey] = useState(false);

  const isObj = isObject(value);
  const isArr = Array.isArray(value);
  const isExpandable = isObj || isArr;
  const depth = path.length - 1;
  const indent = depth * 16;

  const startEdit = () => {
    const displayValue = isPrimitive(value) ? String(value) : JSON.stringify(value);
    setEditValue(displayValue);
    setIsEditing(true);
  };

  const commitEdit = () => {
    const parsed = parseInputValue(editValue);
    onUpdate(path, parsed);
    setIsEditing(false);
  };

  const handleCommitRename = (trimmedKey: string) => {
    const isChanged = trimmedKey !== nodeKey;
    const isNonEmpty = trimmedKey !== "";
    const isValidRename = isChanged && isNonEmpty;

    if (isValidRename) {
      onRename(path, trimmedKey);
    }

    setIsRenamingKey(false);
  };

  return (
    <div>
      <TreeNodeRowContent
        nodeKey={nodeKey}
        value={value}
        indent={indent}
        isExpandable={isExpandable}
        isExpanded={isExpanded}
        isEditing={isEditing}
        isRenamingKey={isRenamingKey}
        editValue={editValue}
        path={path}
        onToggleExpand={() => setIsExpanded(!isExpanded)}
        onStartEdit={startEdit}
        onCommitEdit={commitEdit}
        onCancelEdit={() => setIsEditing(false)}
        onEditValueChange={setEditValue}
        onStartRename={() => setIsRenamingKey(true)}
        onCommitRename={handleCommitRename}
        onCancelRename={() => setIsRenamingKey(false)}
        onUpdate={onUpdate}
        onDelete={onDelete}
      />
      <TreeNodeChildren
        value={value}
        path={path}
        isExpandable={isExpandable}
        isExpanded={isExpanded}
        isObj={isObj}
        isArr={isArr}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onRename={onRename}
      />
    </div>
  );
}

/* ---- Sub-components ---- */

interface TreeNodeRowContentProps {
  nodeKey: string;
  value: JsonValue;
  indent: number;
  isExpandable: boolean;
  isExpanded: boolean;
  isEditing: boolean;
  isRenamingKey: boolean;
  editValue: string;
  path: string[];
  onToggleExpand: () => void;
  onStartEdit: () => void;
  onCommitEdit: () => void;
  onCancelEdit: () => void;
  onEditValueChange: (val: string) => void;
  onStartRename: () => void;
  onCommitRename: (newKey: string) => void;
  onCancelRename: () => void;
  onUpdate: OnUpdateHandler;
  onDelete: OnDeleteHandler;
}

/** The main row content: toggle, icon, key, colon, value, actions. */
function TreeNodeRowContent(props: TreeNodeRowContentProps) {
  return (
    <div
      className="flex items-center gap-1 group rounded-sm hover:bg-primary/5 px-1 py-0.5"
      style={{ paddingLeft: `${props.indent + 4}px` }}
    >
      <ExpandToggle
        isExpandable={props.isExpandable}
        isExpanded={props.isExpanded}
        onToggle={props.onToggleExpand}
      />
      <TypeIcon value={props.value} />
      <TreeNodeKeyEditor
        nodeKey={props.nodeKey}
        isRenamingKey={props.isRenamingKey}
        onStartRename={props.onStartRename}
        onCommitRename={props.onCommitRename}
        onCancelRename={props.onCancelRename}
      />
      <span className="text-xs text-muted-foreground">:</span>
      <TreeNodeValueEditor
        value={props.value}
        isEditing={props.isEditing}
        editValue={props.editValue}
        onEditValueChange={props.onEditValueChange}
        onCommitEdit={props.onCommitEdit}
        onCancelEdit={props.onCancelEdit}
        onStartEdit={props.onStartEdit}
      />
      <TreeNodeActions
        value={props.value}
        path={props.path}
        isExpandable={props.isExpandable}
        onUpdate={props.onUpdate}
        onDelete={props.onDelete}
        onStartEdit={props.onStartEdit}
      />
    </div>
  );
}

interface ExpandToggleProps {
  isExpandable: boolean;
  isExpanded: boolean;
  onToggle: () => void;
}

/** Expand/collapse chevron for expandable nodes. */
function ExpandToggle({ isExpandable, isExpanded, onToggle }: ExpandToggleProps) {
  if (isExpandable) {
    return (
      <button className="p-0.5 rounded hover:bg-primary/10" onClick={onToggle}>
        {isExpanded
          ? <ChevronDown className="h-3 w-3 text-muted-foreground" />
          : <ChevronRight className="h-3 w-3 text-muted-foreground" />}
      </button>
    );
  }

  return <span className="w-4" />;
}

interface TreeNodeChildrenProps {
  value: JsonValue;
  path: string[];
  isExpandable: boolean;
  isExpanded: boolean;
  isObj: boolean;
  isArr: boolean;
  onUpdate: OnUpdateHandler;
  onDelete: OnDeleteHandler;
  onRename: OnRenameHandler;
}

/** Renders child nodes when the parent is expanded. */
function TreeNodeChildren({
  value,
  path,
  isExpandable,
  isExpanded,
  isObj,
  isArr,
  onUpdate,
  onDelete,
  onRename,
}: TreeNodeChildrenProps) {
  const isCollapsed = !isExpanded;
  const isNotExpandable = !isExpandable;

  if (isNotExpandable || isCollapsed) {
    return null;
  }

  if (isObj) {
    return (
      <ObjectNodes
        obj={value as JsonObject}
        path={path}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onRename={onRename}
      />
    );
  }

  if (isArr) {
    return (
      <ArrayNodes
        items={value as JsonArray}
        path={path}
        onUpdate={onUpdate}
        onDelete={onDelete}
        onRename={onRename}
      />
    );
  }

  return null;
}

interface ArrayNodesProps {
  items: JsonArray;
  path: string[];
  onUpdate: OnUpdateHandler;
  onDelete: OnDeleteHandler;
  onRename: OnRenameHandler;
}

/** Renders array items as indexed TreeNodeRows. */
function ArrayNodes({ items, path, onUpdate, onDelete, onRename }: ArrayNodesProps) {
  return (
    <div className="space-y-0.5">
      {items.map((item, idx) => (
        <TreeNodeRow
          key={`${path.join(".")}.${idx}`}
          nodeKey={String(idx)}
          value={item}
          path={[...path, String(idx)]}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onRename={onRename}
        />
      ))}
    </div>
  );
}
