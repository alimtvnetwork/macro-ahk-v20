import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FolderOpen } from "lucide-react";
import type { ActiveProjectData } from "@/hooks/use-popup-data";

interface Props {
  data: ActiveProjectData;
  onSelect: (projectId: string) => Promise<void>;
}

export function ProjectSelector({ data, onSelect }: Props) {
  const activeId = data.activeProject?.id ?? "";
  const selectableProjects = data.allProjects.filter((project) => project.isGlobal !== true);
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
        <Select value={selectedValue} onValueChange={onSelect}>
          <SelectTrigger className="h-8 text-xs">
            <SelectValue placeholder="Select a project" />
          </SelectTrigger>
          <SelectContent disablePortal>
            {selectableProjects.map((p) => (
              <SelectItem key={p.id} value={p.id} className="text-xs">
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : (
        <p className="text-xs text-muted-foreground">No runnable projects configured</p>
      )}
    </div>
  );
}
