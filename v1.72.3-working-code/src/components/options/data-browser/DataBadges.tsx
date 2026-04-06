import { Badge } from "@/components/ui/badge";

const LEVEL_COLORS: Record<string, string> = {
  ERROR: "bg-destructive/15 text-destructive",
  WARN: "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
  INFO: "bg-primary/15 text-primary",
  DEBUG: "bg-muted text-muted-foreground",
};

interface LevelBadgeProps {
  level: string;
}

/** Badge showing a log level with appropriate color. */
export function LevelBadge({ level }: LevelBadgeProps) {
  const colorClass = LEVEL_COLORS[level] ?? "bg-muted text-muted-foreground";

  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 ${colorClass}`}
    >
      {level}
    </Badge>
  );
}

const CATEGORY_COLORS: Record<string, string> = {
  USER: "bg-[hsl(280,60%,50%)]/15 text-[hsl(280,60%,50%)]",
  DATA_BRIDGE: "bg-[hsl(200,70%,50%)]/15 text-[hsl(200,70%,50%)]",
  LIFECYCLE: "bg-[hsl(150,50%,45%)]/15 text-[hsl(150,50%,45%)]",
  INJECTION: "bg-[hsl(35,80%,50%)]/15 text-[hsl(35,80%,50%)]",
  CONFIG: "bg-[hsl(330,55%,50%)]/15 text-[hsl(330,55%,50%)]",
  AUTH: "bg-[hsl(10,70%,50%)]/15 text-[hsl(10,70%,50%)]",
};

interface CategoryBadgeProps {
  category: string;
}

/** Badge showing a log category with distinct color. */
export function CategoryBadge({ category }: CategoryBadgeProps) {
  const colorClass = CATEGORY_COLORS[category] ?? "bg-muted text-muted-foreground";

  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 ${colorClass}`}
    >
      {category}
    </Badge>
  );
}

interface StatBoxProps {
  label: string;
  value: number;
}

/** Compact stat box with hover lift. */
export function StatBox({ label, value }: StatBoxProps) {
  return (
    <div
      className="rounded-md bg-muted/50 p-3 text-center hover-lift"
    >
      <div className="text-lg font-bold">{value.toLocaleString()}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
