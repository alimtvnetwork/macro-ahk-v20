import {
  Braces,
  List,
  Type,
  Hash,
  ToggleLeft,
} from "lucide-react";
import type { JsonValue } from "./json-tree-types";
import { isObject } from "./json-tree-helpers";

interface TypeIconProps {
  value: JsonValue;
}

/** Renders the appropriate icon for a JSON value type. */
export function TypeIcon({ value }: TypeIconProps) {
  const isObj = isObject(value);
  if (isObj) return <Braces className="h-3 w-3 text-primary/60 shrink-0" />;

  const isArr = Array.isArray(value);
  if (isArr) return <List className="h-3 w-3 text-accent/80 shrink-0" />;

  const isNum = typeof value === "number";
  if (isNum) return <Hash className="h-3 w-3 text-[hsl(var(--warning))]/80 shrink-0" />;

  const isBool = typeof value === "boolean";
  if (isBool) return <ToggleLeft className="h-3 w-3 text-[hsl(var(--success))]/80 shrink-0" />;

  return <Type className="h-3 w-3 text-muted-foreground shrink-0" />;
}
