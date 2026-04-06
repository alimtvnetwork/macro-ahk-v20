import { useState, useCallback, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Upload, FileUp } from "lucide-react";
import type { StoredScript, StoredConfig } from "@/hooks/use-projects-scripts";
import { ProjectScriptSelector, type ScriptBinding } from "./ProjectScriptSelector";
import { hasFolderEntry, parseDroppedFolder } from "@/lib/folder-parser";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  availableScripts: StoredScript[];
  availableConfigs: StoredConfig[];
  onSave: (project: Record<string, unknown>) => Promise<void>;
  onCancel: () => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ProjectCreateForm({ availableScripts, availableConfigs, onSave, onCancel }: Props) {
  const [name, setName] = useState("");
  const [version, setVersion] = useState("1.0.0");
  const [description, setDescription] = useState("");
  const [scriptBindings, setScriptBindings] = useState<ScriptBinding[]>([]);
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const applyManifest = useCallback((manifest: Record<string, unknown>) => {
    if (typeof manifest.name === "string") setName((prev) => prev || manifest.name as string);
    if (typeof manifest.version === "string") setVersion((prev) => prev === "1.0.0" ? manifest.version as string : prev);
    if (typeof manifest.description === "string") setDescription((prev) => prev || manifest.description as string);

    if (Array.isArray(manifest.scripts)) {
      const bindings: ScriptBinding[] = manifest.scripts.map((s: Record<string, unknown>, i: number) => ({
        scriptId: `imported_${crypto.randomUUID().slice(0, 8)}`,
        scriptName: (typeof s.path === "string" ? s.path : "") as string,
        order: typeof s.order === "number" ? s.order : i,
        runAt: (typeof s.runAt === "string" ? s.runAt : "document_idle") as string,
        code: "",
        configBindings: [],
      }));
      setScriptBindings(bindings);
    }
  }, []);

  const handleJsonFileImport = useCallback(async (file: File) => {
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Record<string, unknown>;
      applyManifest(parsed);
      toast.success(`Imported from "${file.name}"`);
    } catch (importError) {
      const msg = importError instanceof Error ? importError.message : "Invalid JSON file";
      toast.error(msg);
    }
  }, [applyManifest]);

  const handleFileInputChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void handleJsonFileImport(file);
    e.target.value = "";
  }, [handleJsonFileImport]);

  const handleSave = async () => {
    if (name.trim() === "") {
      toast.error("Project name is required");
      return;
    }

    const scripts = scriptBindings.map((b, i) => ({
      path: b.scriptName,
      order: i,
      runAt: b.runAt,
      configBinding: b.configBindings.map((c) => c.configId).join(",") || undefined,
    }));

    try {
      await onSave({
        id: crypto.randomUUID(),
        schemaVersion: 1,
        name: name.trim(),
        version: version.trim(),
        description: description.trim() || undefined,
        targetUrls: [],
        scripts,
        configs: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      toast.success("Project created");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to create project";
      toast.error(msg);
    }
  };

  const handleFolderDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);

    if (hasFolderEntry(e.dataTransfer)) {
      try {
        const parsed = await parseDroppedFolder(e.dataTransfer);
        const bindings: ScriptBinding[] = parsed.scripts.map((s) => ({
          scriptId: `folder_${crypto.randomUUID().slice(0, 8)}`,
          scriptName: s.name,
          order: s.order,
          runAt: s.runAt,
          code: "",
          configBindings: [],
        }));

        setName((prev) => prev || parsed.manifest.name);
        setVersion((prev) => prev === "1.0.0" ? parsed.manifest.version : prev);
        setDescription((prev) => prev || parsed.manifest.description);
        setScriptBindings(bindings);

        toast.success(`Imported "${parsed.manifest.name}" — ${parsed.scripts.length} script(s)`);
      } catch (parseError) {
        const msg = parseError instanceof Error ? parseError.message : "Folder parse failed";
        toast.error(msg);
      }
      return;
    }

    toast.error("Please drop a folder containing marco-project.json");
  }, []);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-bold tracking-tight">New Project</h2>

      <Card>
        <CardContent className="pt-6 space-y-4">
          <Input
            placeholder="Project name"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="flex gap-2">
            <Input
              placeholder="Version"
              value={version}
              className="w-28"
              onChange={(e) => setVersion(e.target.value)}
            />
            <Input
              placeholder="Description (optional)"
              value={description}
              className="flex-1"
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          <ProjectScriptSelector
            availableScripts={availableScripts}
            availableConfigs={availableConfigs}
            selectedScripts={scriptBindings}
            onChange={setScriptBindings}
          />

          {/* Import zone */}
          <div className="space-y-2">
            <div
              onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
              onDragLeave={() => setIsDragOver(false)}
              onDrop={handleFolderDrop}
              className={`
                border-2 border-dashed rounded-md p-4 text-center transition-all duration-200 cursor-pointer
                ${isDragOver
                  ? "border-primary bg-primary/5 text-primary"
                  : "border-muted-foreground/20 text-muted-foreground hover:border-primary/40"
                }
              `}
            >
              <Upload className="h-4 w-4 mx-auto mb-1" />
              <p className="text-[11px]">
                Drop a project folder to import from{" "}
                <code className="text-[10px] bg-muted px-1 rounded">marco-project.json</code>
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".json"
              className="hidden"
              onChange={handleFileInputChange}
            />
            <Button
              size="sm"
              variant="outline"
              className="w-full gap-1.5 text-xs hover:bg-primary/15 hover:text-primary transition-all duration-200"
              onClick={() => fileInputRef.current?.click()}
            >
              <FileUp className="h-3.5 w-3.5" />
              Import from JSON file
            </Button>
          </div>

          <div className="flex gap-2 justify-end">
            <Button size="sm" variant="ghost" onClick={onCancel}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              Create
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
