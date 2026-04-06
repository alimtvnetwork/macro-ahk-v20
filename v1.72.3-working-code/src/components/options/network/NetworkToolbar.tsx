import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RefreshCw, Trash2 } from "lucide-react";

interface NetworkToolbarProps {
  statusFilter: string;
  typeFilter: string;
  autoRefresh: boolean;
  isLoading: boolean;
  onStatusFilterChange: (value: string) => void;
  onTypeFilterChange: (value: string) => void;
  onToggleAutoRefresh: () => void;
  onRefresh: () => void;
  onClear: () => void;
}

/** Toolbar with status/type filters, auto-refresh toggle, and clear button. */
export function NetworkToolbar({
  statusFilter,
  typeFilter,
  autoRefresh,
  isLoading,
  onStatusFilterChange,
  onTypeFilterChange,
  onToggleAutoRefresh,
  onRefresh,
  onClear,
}: NetworkToolbarProps) {
  return (
    <div className="flex items-center gap-2">
      <StatusFilterSelect value={statusFilter} onChange={onStatusFilterChange} />
      <TypeFilterSelect value={typeFilter} onChange={onTypeFilterChange} />
      <AutoRefreshButton isActive={autoRefresh} onToggle={onToggleAutoRefresh} />
      <RefreshButton isLoading={isLoading} onRefresh={onRefresh} />
      <ClearButton onClear={onClear} />
    </div>
  );
}

/* ---- Sub-components ---- */

interface FilterSelectProps {
  value: string;
  onChange: (value: string) => void;
}

/** Dropdown for filtering by HTTP status bucket. */
function StatusFilterSelect({ value, onChange }: FilterSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-24 h-8 text-xs">
        <SelectValue placeholder="Status" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        <SelectItem value="2xx">2xx</SelectItem>
        <SelectItem value="3xx">3xx</SelectItem>
        <SelectItem value="4xx">4xx</SelectItem>
        <SelectItem value="5xx">5xx</SelectItem>
        <SelectItem value="0xx">Error</SelectItem>
      </SelectContent>
    </Select>
  );
}

/** Dropdown for filtering by request type (XHR/Fetch). */
function TypeFilterSelect({ value, onChange }: FilterSelectProps) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-24 h-8 text-xs">
        <SelectValue placeholder="Type" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="all">All</SelectItem>
        <SelectItem value="xhr">XHR</SelectItem>
        <SelectItem value="fetch">Fetch</SelectItem>
      </SelectContent>
    </Select>
  );
}

interface AutoRefreshButtonProps {
  isActive: boolean;
  onToggle: () => void;
}

/** Toggle button for live auto-refresh. */
function AutoRefreshButton({ isActive, onToggle }: AutoRefreshButtonProps) {
  const variant = isActive ? "default" : "ghost";
  const dotClass = isActive
    ? "bg-[hsl(var(--success))] animate-pulse"
    : "bg-muted-foreground";
  const label = isActive ? "Live" : "Paused";

  return (
    <Button
      variant={variant}
      size="sm"
      className="h-8 text-xs gap-1.5"
      onClick={onToggle}
    >
      <span className={`h-2 w-2 rounded-full ${dotClass}`} />
      {label}
    </Button>
  );
}

interface RefreshButtonProps {
  isLoading: boolean;
  onRefresh: () => void;
}

/** Manual refresh button. */
function RefreshButton({ isLoading, onRefresh }: RefreshButtonProps) {
  const spinClass = isLoading ? "animate-spin" : "";

  return (
    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={onRefresh} disabled={isLoading}>
      <RefreshCw className={`h-4 w-4 ${spinClass}`} />
    </Button>
  );
}

interface ClearButtonProps {
  onClear: () => void;
}

/** Button to clear all captured requests. */
function ClearButton({ onClear }: ClearButtonProps) {
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-8 w-8 text-destructive hover:text-destructive"
      onClick={onClear}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );
}
