import { ScriptBundlesListView } from "./ScriptBundlesListView";
import type { StoredScript, StoredConfig } from "@/hooks/use-projects-scripts";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  scripts: StoredScript[];
  scriptsLoading: boolean;
  onSaveScript: (s: Partial<StoredScript>) => Promise<void>;
  onDeleteScript: (id: string) => Promise<void>;
  configs: StoredConfig[];
  configsLoading: boolean;
  onSaveConfig: (c: Partial<StoredConfig>) => Promise<void>;
  onDeleteConfig: (id: string) => Promise<void>;
  onNewScript: () => void;
  onEditScript: (scriptId: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function GlobalScriptsView({
  scripts,
  scriptsLoading,
  onSaveScript,
  onDeleteScript,
  configs,
  onSaveConfig,
  onNewScript,
  onEditScript,
}: Props) {
  const handleFileDrop = async (files: FileList) => {
    for (const file of Array.from(files)) {
      const content = await file.text();
      const isJson = file.name.endsWith(".json");

      if (isJson) {
        try {
          JSON.parse(content);
          await onSaveConfig({
            name: file.name.replace(/\.[^.]+$/, ""),
            json: content,
          });
        } catch {
          toast.error(`Invalid JSON: ${file.name}`);
          continue;
        }
      } else {
        await onSaveScript({
          name: file.name.replace(/\.[^.]+$/, ""),
          code: content,
          order: scripts.length,
          isEnabled: true,
        } as Partial<StoredScript>);
      }
    }
    toast.success(`Processed ${files.length} file(s)`);
  };

  return (
    <ScriptBundlesListView
      scripts={scripts}
      configs={configs}
      loading={scriptsLoading}
      onNew={onNewScript}
      onEdit={onEditScript}
      onDelete={onDeleteScript}
      onFileDrop={handleFileDrop}
    />
  );
}
