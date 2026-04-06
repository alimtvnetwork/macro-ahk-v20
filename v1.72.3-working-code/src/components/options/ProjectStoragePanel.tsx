/**
 * Marco Extension — Project Storage Panel
 *
 * Container with sub-tabs for KV Store, Database, and IndexedDB.
 * Replaces the old "Data" tab with a unified "Storage" experience.
 *
 * See spec/12-chrome-extension/67-project-scoped-database-and-rest-api.md
 */

import { useState } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Database, KeyRound, HardDrive } from "lucide-react";
import { DataBrowserPanel } from "./DataBrowserPanel";
import { ProjectDatabasePanel } from "./project-database/ProjectDatabasePanel";

type StorageSubTab = "kv" | "database" | "indexeddb";

interface ProjectStoragePanelProps {
  projectId: string;
  projectSlug: string;
}

export function ProjectStoragePanel({ projectId, projectSlug }: ProjectStoragePanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<StorageSubTab>("kv");

  return (
    <div className="space-y-4">
      <Tabs value={activeSubTab} onValueChange={(v) => setActiveSubTab(v as StorageSubTab)}>
        <TabsList className="grid w-full grid-cols-3 h-8">
          <TabsTrigger value="kv" className="gap-1.5 text-xs">
            <KeyRound className="h-3.5 w-3.5" />
            KV Store
          </TabsTrigger>
          <TabsTrigger value="database" className="gap-1.5 text-xs">
            <Database className="h-3.5 w-3.5" />
            Database
          </TabsTrigger>
          <TabsTrigger value="indexeddb" className="gap-1.5 text-xs">
            <HardDrive className="h-3.5 w-3.5" />
            IndexedDB
          </TabsTrigger>
        </TabsList>

        <TabsContent value="kv" className="mt-3">
          <DataBrowserPanel />
        </TabsContent>

        <TabsContent value="database" className="mt-3">
          <ProjectDatabasePanel projectId={projectId} projectSlug={projectSlug} />
        </TabsContent>

        <TabsContent value="indexeddb" className="mt-3">
          <div className="rounded-md border border-dashed p-6 text-center text-sm text-muted-foreground">
            <HardDrive className="mx-auto h-8 w-8 mb-2 opacity-40" />
            <p>IndexedDB browser for the extension origin.</p>
            <p className="text-xs mt-1">Use the global Storage Browser for IndexedDB inspection.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
