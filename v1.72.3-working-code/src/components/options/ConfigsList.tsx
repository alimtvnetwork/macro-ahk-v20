import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, FileJson, Code } from "lucide-react";
import { JsonTreeEditor } from "./JsonTreeEditor";
import { MonacoCodeEditor } from "./LazyMonacoCodeEditor";
import type { StoredConfig } from "@/hooks/use-projects-scripts";
import { toast } from "sonner";

interface Props {
  configs: StoredConfig[];
  loading: boolean;
  onSave: (config: Partial<StoredConfig>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

interface FormState {
  isOpen: boolean;
  editingId: string | null;
  name: string;
  description: string;
  json: string;
  editorMode: "tree" | "raw";
}

const emptyForm: FormState = {
  isOpen: false,
  editingId: null,
  name: "",
  description: "",
  json: "{}",
  editorMode: "tree",
};

export function ConfigsList({ configs, loading, onSave, onDelete }: Props) {
  const [form, setForm] = useState<FormState>(emptyForm);

  const handleOpen = (config?: StoredConfig) => {
    const isEditing = config !== undefined;
    setForm({
      isOpen: true,
      editingId: isEditing ? config.id : null,
      name: isEditing ? config.name : "",
      description: isEditing ? (config.description ?? "") : "",
      json: isEditing ? formatJson(config.json) : "{}",
      editorMode: "tree",
    });
  };

  const handleSave = async () => {
    const isNameEmpty = form.name.trim() === "";
    if (isNameEmpty) {
      toast.error("Config name is required");
      return;
    }

    const isJsonInvalid = !validateJson(form.json);
    if (isJsonInvalid) {
      toast.error("Invalid JSON");
      return;
    }

    await onSave({
      id: form.editingId ?? undefined,
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      json: form.json,
    });

    const isEditing = form.editingId !== null;
    toast.success(isEditing ? "Config updated" : "Config created");
    setForm(emptyForm);
  };

  const handleDelete = async (id: string) => {
    await onDelete(id);
    toast.success("Config deleted");
  };

  if (loading) {
    return <div className="text-sm text-muted-foreground">Loading configs…</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Configs / Variables</h3>
        <Button
          size="sm"
          variant="outline"
          className="hover:bg-primary/15 hover:text-primary"
          onClick={() => handleOpen()}
        >
          <Plus className="h-3.5 w-3.5 mr-1" /> New
        </Button>
      </div>

      {form.isOpen && (
        <Card className="border-primary/30">
          <CardContent className="pt-4 space-y-3">
            <Input
              placeholder="Config name"
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
            />
            <Input
              placeholder="Description (optional)"
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            />

            {/* Tree / Raw toggle */}
            <Tabs
              value={form.editorMode}
              onValueChange={(v) => setForm((f) => ({ ...f, editorMode: v as "tree" | "raw" }))}
            >
              <TabsList className="h-7">
                <TabsTrigger value="tree" className="text-[10px] gap-1 h-6 hover:bg-primary/15 hover:text-primary">
                  <FileJson className="h-3 w-3" /> Tree
                </TabsTrigger>
                <TabsTrigger value="raw" className="text-[10px] gap-1 h-6 hover:bg-primary/15 hover:text-primary">
                  <Code className="h-3 w-3" /> Raw JSON
                </TabsTrigger>
              </TabsList>

              <TabsContent value="tree" className="mt-2">
                <JsonTreeEditor
                  value={form.json}
                  onChange={(json) => setForm((f) => ({ ...f, json }))}
                />
              </TabsContent>

              <TabsContent value="raw" className="mt-2">
                <ErrorBoundary section="Config Raw JSON Editor">
                  <MonacoCodeEditor
                    language="json"
                    value={form.json}
                    onChange={(json) => setForm((f) => ({ ...f, json }))}
                    height="240px"
                  />
                </ErrorBoundary>
              </TabsContent>
            </Tabs>

            <div className="flex gap-2 justify-end">
              <Button size="sm" variant="ghost" onClick={() => setForm(emptyForm)}>
                Cancel
              </Button>
              <Button size="sm" onClick={handleSave}>
                {form.editingId ? "Update" : "Create"}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {configs.length === 0 && !form.isOpen && (
        <p className="text-xs text-muted-foreground py-4 text-center">
          No configs yet. Click "New" to create one.
        </p>
      )}

      {configs.map((config) => (
        <Card key={config.id} className="group">
          <CardHeader className="py-3 px-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileJson className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-sm">{config.name}</CardTitle>
              </div>
              <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 hover:bg-primary/15 hover:text-primary"
                  onClick={() => handleOpen(config)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive hover:bg-destructive/10">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Delete "{config.name}"?</AlertDialogTitle>
                      <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                      <AlertDialogAction onClick={() => handleDelete(config.id)}>Delete</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              </div>
            </div>
            {config.description && (
              <p className="text-xs text-muted-foreground mt-1">{config.description}</p>
            )}
          </CardHeader>
        </Card>
      ))}
    </div>
  );
}

function validateJson(str: string): boolean {
  try {
    JSON.parse(str);
    return true;
  } catch {
    return false;
  }
}

function formatJson(input: unknown): string {
  if (typeof input === "string") {
    try {
      return JSON.stringify(JSON.parse(input), null, 2);
    } catch {
      return input;
    }
  }

  try {
    return JSON.stringify(input ?? {}, null, 2);
  } catch {
    return "{}";
  }
}
