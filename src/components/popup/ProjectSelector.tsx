import { Badge } from "@/components/ui/badge";
import { FolderOpen } from "lucide-react";
import type { ActiveProjectData } from "@/hooks/use-popup-data";

interface Props {
  data: ActiveProjectData;
  onSelect: (projectId: string) => Promise<void>;
}

export function ProjectSelector({ data, onSelect }: Props) {
  const activeId = data.activeProject?.id ?? "";
  const selectableProjects = data.allProjects;
  const hasProjects = selectableProjects.length > 0;
  const selectedValue = selectableProjects.some((project) => project.id === activeId) ? activeId : "";

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <FolderOpen className="h-3.5 w-3.5 text-muted-foreground" />
          <span className="text-xs font-medium text-foreground">Active Project</span>
        </div>
        {data.activeProject && data.activeProject.version && data.activeProject.version.trim() !== "" && (
          <Badge variant="secondary" className="text-[10px]">
            v{data.activeProject.version}
          </Badge>
        )}
      </div>

      {hasProjects ? (
        <select
          value={selectedValue}
          onChange={(e) => void onSelect(e.target.value)}
          className="flex h-8 w-full items-center rounded-md border border-input bg-background px-2 py-1 text-xs text-foreground ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {!selectedValue && (
            <option value="" disabled>Select a project</option>
          )}
          {selectableProjects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
      ) : (
        <p className="text-xs text-muted-foreground">No runnable projects configured</p>
      )}
    </div>
  );
}
