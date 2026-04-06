import type { JsonObject, OnUpdateHandler, OnDeleteHandler, OnRenameHandler } from "./json-tree-types";
import { TreeNodeRow } from "./TreeNodeRow";

interface ObjectNodesProps {
  obj: JsonObject;
  path: string[];
  onUpdate: OnUpdateHandler;
  onDelete: OnDeleteHandler;
  onRename: OnRenameHandler;
}

/** Renders all entries of a JSON object as TreeNodeRows. */
export function ObjectNodes({ obj, path, onUpdate, onDelete, onRename }: ObjectNodesProps) {
  return (
    <div className="space-y-0.5">
      {Object.entries(obj).map(([key, val]) => (
        <TreeNodeRow
          key={[...path, key].join(".")}
          nodeKey={key}
          value={val}
          path={[...path, key]}
          onUpdate={onUpdate}
          onDelete={onDelete}
          onRename={onRename}
        />
      ))}
    </div>
  );
}
