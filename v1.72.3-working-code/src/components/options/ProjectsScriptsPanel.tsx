import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ProjectsList } from "./ProjectsList";
import { ScriptsList } from "./ScriptsList";
import { ConfigsList } from "./ConfigsList";
import { useProjects, useScripts, useConfigs } from "@/hooks/use-projects-scripts";
import { FolderOpen, FileCode, FileJson } from "lucide-react";

export function ProjectsScriptsPanel() {
  const { projects, loading: pLoading, save: pSave, remove: pRemove } = useProjects();
  const { scripts, loading: sLoading, save: sSave, remove: sRemove } = useScripts();
  const { configs, loading: cLoading, save: cSave, remove: cRemove } = useConfigs();

  return (
    <Tabs defaultValue="projects" className="w-full">
      <TabsList className="w-full justify-start bg-muted/50">
        <TabsTrigger value="projects" className="gap-1.5 text-xs hover:bg-primary/15 hover:text-primary">
          <FolderOpen className="h-3 w-3" /> Projects ({projects.length})
        </TabsTrigger>
        <TabsTrigger value="scripts" className="gap-1.5 text-xs hover:bg-primary/15 hover:text-primary">
          <FileCode className="h-3 w-3" /> Scripts ({scripts.length})
        </TabsTrigger>
        <TabsTrigger value="configs" className="gap-1.5 text-xs hover:bg-primary/15 hover:text-primary">
          <FileJson className="h-3 w-3" /> Configs ({configs.length})
        </TabsTrigger>
      </TabsList>

      <TabsContent value="projects" className="mt-4">
        <ProjectsList projects={projects} loading={pLoading} onSave={pSave} onDelete={pRemove} availableScripts={scripts} availableConfigs={configs} />
      </TabsContent>
      <TabsContent value="scripts" className="mt-4">
        <ScriptsList scripts={scripts} configs={configs} loading={sLoading} onSave={sSave} onDelete={sRemove} onSaveConfig={cSave} />
      </TabsContent>
      <TabsContent value="configs" className="mt-4">
        <ConfigsList configs={configs} loading={cLoading} onSave={cSave} onDelete={cRemove} />
      </TabsContent>
    </Tabs>
  );
}
