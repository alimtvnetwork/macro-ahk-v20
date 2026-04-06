/**
 * ProjectFilesPanel — Full file manager for project files.
 *
 * Features: file tree, text editor, upload from disk, drag-and-drop,
 * rename, download, folder creation, file size display.
 *
 * Uses FILE_LIST / FILE_GET / FILE_SAVE / FILE_DELETE messages
 * to manage files stored in the ProjectFiles table.
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { sendMessage } from "@/lib/message-client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
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
import {
  File,
  Folder,
  FolderPlus,
  Trash2,
  Save,
  Plus,
  RefreshCw,
  ChevronRight,
  ChevronDown,
  Upload,
  Download,
  Pencil,
  Image,
  FileText,
  FileQuestion,
} from "lucide-react";
import { MonacoCodeEditor } from "./LazyMonacoCodeEditor";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ProjectFile {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  createdAt: string;
  updatedAt: string;
}

interface FileNode {
  name: string;
  path: string;
  isDir: boolean;
  children: FileNode[];
  file?: ProjectFile;
}

interface Props {
  projectId: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function buildTree(files: ProjectFile[]): FileNode[] {
  const root: FileNode = { name: "", path: "", isDir: true, children: [] };

  for (const file of files) {
    const parts = file.filename.split("/");
    let current = root;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      const path = parts.slice(0, i + 1).join("/");

      if (isLast) {
        current.children.push({
          name: part,
          path,
          isDir: false,
          children: [],
          file,
        });
      } else {
        let dir = current.children.find((c) => c.isDir && c.name === part);
        if (!dir) {
          dir = { name: part, path, isDir: true, children: [] };
          current.children.push(dir);
        }
        current = dir;
      }
    }
  }

  const sortNodes = (nodes: FileNode[]) => {
    nodes.sort((a, b) => {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return a.name.localeCompare(b.name);
    });
    nodes.forEach((n) => n.isDir && sortNodes(n.children));
  };
  sortNodes(root.children);
  return root.children;
}

function getLanguage(filename: string): "javascript" | "json" | "markdown" {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  if (ext === "json") return "json";
  if (["md", "markdown", "txt", "prompt"].includes(ext)) return "markdown";
  return "javascript";
}

const IMAGE_EXTS = new Set(["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp", "ico"]);
const PDF_EXTS = new Set(["pdf"]);
const BINARY_EXTS = new Set([
  ...IMAGE_EXTS, ...PDF_EXTS,
  "zip", "tar", "gz", "7z", "rar",
  "woff", "woff2", "ttf", "otf", "eot",
  "mp3", "mp4", "wav", "ogg", "webm",
  "exe", "dll", "so", "dylib",
]);

function isBinaryFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return BINARY_EXTS.has(ext);
}

function isImageFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTS.has(ext);
}

function isPdfFile(filename: string): boolean {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return PDF_EXTS.has(ext);
}

/** Build a data URL from base64 content + mime type */
function buildDataUrl(base64: string, mimeType: string): string {
  return `data:${mimeType};base64,${base64}`;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function readFileAsBase64(file: globalThis.File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // Strip data URL prefix
      const base64 = result.includes(",") ? result.split(",")[1] : result;
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function guessMime(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const map: Record<string, string> = {
    json: "application/json",
    js: "application/javascript",
    ts: "application/typescript",
    md: "text/markdown",
    txt: "text/plain",
    html: "text/html",
    css: "text/css",
    csv: "text/csv",
    xml: "application/xml",
    yaml: "text/yaml",
    yml: "text/yaml",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    pdf: "application/pdf",
  };
  return map[ext] ?? "application/octet-stream";
}

/* ------------------------------------------------------------------ */
/*  Tree Node Component                                                */
/* ------------------------------------------------------------------ */

function TreeNode({
  node,
  depth,
  selectedPath,
  expandedDirs,
  onSelect,
  onToggleDir,
  onDrop,
  onMoveFile,
}: {
  node: FileNode;
  depth: number;
  selectedPath: string | null;
  expandedDirs: Set<string>;
  onSelect: (node: FileNode) => void;
  onToggleDir: (path: string) => void;
  onDrop?: (files: globalThis.File[], targetDir: string) => void;
  onMoveFile?: (sourcePath: string, targetDir: string) => void;
}) {
  const isExpanded = expandedDirs.has(node.path);
  const isSelected = selectedPath === node.path;
  const [dragOver, setDragOver] = useState(false);

  const handleDragStart = (e: React.DragEvent) => {
    if (node.isDir) return;
    e.dataTransfer.setData("application/x-marco-file-path", node.path);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent) => {
    // Accept internal file moves on dirs, or external file drops on dirs
    if (!node.isDir) return;
    const hasInternal = e.dataTransfer.types.includes("application/x-marco-file-path");
    const hasFiles = e.dataTransfer.types.includes("Files");
    if (!hasInternal && !hasFiles) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = hasInternal ? "move" : "copy";
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDropEvent = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    if (!node.isDir) return;

    // Internal file move
    const sourcePath = e.dataTransfer.getData("application/x-marco-file-path");
    if (sourcePath && onMoveFile) {
      onMoveFile(sourcePath, node.path);
      return;
    }

    // External file upload
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0 && onDrop) {
      onDrop(droppedFiles, node.path);
    }
  };

  return (
    <>
      <button
        draggable={!node.isDir}
        className={`w-full flex items-center gap-1.5 px-2 py-1 text-xs rounded-sm transition-colors hover:bg-muted/50 ${
          isSelected ? "bg-primary/10 text-primary font-medium" : "text-foreground"
        } ${dragOver ? "bg-primary/20 ring-1 ring-primary/40" : ""}`}
        style={{ paddingLeft: `${depth * 16 + 8}px` }}
        onClick={() => {
          if (node.isDir) onToggleDir(node.path);
          else onSelect(node);
        }}
        onDragStart={handleDragStart}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDropEvent}
      >
        {node.isDir ? (
          <>
            {isExpanded ? (
              <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-3 w-3 shrink-0 text-muted-foreground" />
            )}
            <Folder className="h-3.5 w-3.5 shrink-0 text-primary/70" />
          </>
        ) : (
          <>
            <span className="w-3 shrink-0" />
            <File className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
        <span className="truncate">{node.name}</span>
        {!node.isDir && node.file && (
          <span className="ml-auto text-[9px] text-muted-foreground/60 shrink-0">
            {formatSize(node.file.size)}
          </span>
        )}
      </button>
      {node.isDir && isExpanded && node.children.map((child) => (
        <TreeNode
          key={child.path}
          node={child}
          depth={depth + 1}
          selectedPath={selectedPath}
          expandedDirs={expandedDirs}
          onSelect={onSelect}
          onToggleDir={onToggleDir}
          onDrop={onDrop}
          onMoveFile={onMoveFile}
        />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Panel                                                              */
/* ------------------------------------------------------------------ */

export function ProjectFilesPanel({ projectId }: Props) {
  const [files, setFiles] = useState<ProjectFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [tree, setTree] = useState<FileNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<ProjectFile | null>(null);
  const [fileContent, setFileContent] = useState("");
  const [editedContent, setEditedContent] = useState("");
  const [isDirty, setIsDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [expandedDirs, setExpandedDirs] = useState<Set<string>>(new Set());
  const [newFileName, setNewFileName] = useState("");
  const [showNewFile, setShowNewFile] = useState(false);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState("");
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const [rootDragOver, setRootDragOver] = useState(false);
  const [rawBase64, setRawBase64] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadFiles = useCallback(async () => {
    setLoading(true);
    try {
      const result = await sendMessage<{ files: ProjectFile[] }>({
        type: "FILE_LIST",
        projectId,
      });
      const fileList = Array.isArray(result.files) ? result.files : [];
      setFiles(fileList);
      setTree(buildTree(fileList));
    } catch {
      setFiles([]);
      setTree([]);
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadFiles();
  }, [loadFiles]);

  /* ── File operations ── */

  const handleSelectFile = useCallback(async (node: FileNode) => {
    if (!node.file) return;
    try {
      const result = await sendMessage<{ data: string; dataBase64?: string }>({
        type: "FILE_GET",
        fileId: node.file.id,
      });
      const base64 = result.dataBase64 ?? (result.data ? btoa(result.data) : "");
      const binary = isBinaryFile(node.file.filename);
      const content = binary ? "" : (result.dataBase64 ? atob(result.dataBase64) : (typeof result.data === "string" ? result.data : ""));
      setSelectedFile(node.file);
      setRawBase64(binary ? base64 : null);
      setFileContent(content);
      setEditedContent(content);
      setIsDirty(false);
      setRenaming(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load file");
    }
  }, []);

  const handleSave = async () => {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await sendMessage({
        type: "FILE_SAVE",
        projectId,
        filename: selectedFile.filename,
        mimeType: selectedFile.mimeType || "text/plain",
        dataBase64: btoa(editedContent),
      });
      setFileContent(editedContent);
      setIsDirty(false);
      toast.success("File saved");
      void loadFiles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (fileId: string) => {
    try {
      await sendMessage({ type: "FILE_DELETE", fileId });
      if (selectedFile?.id === fileId) {
        setSelectedFile(null);
        setFileContent("");
        setEditedContent("");
        setIsDirty(false);
      }
      toast.success("File deleted");
      void loadFiles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  const handleCreateFile = async () => {
    const name = newFileName.trim();
    if (!name) return;
    try {
      await sendMessage({
        type: "FILE_SAVE",
        projectId,
        filename: name,
        mimeType: guessMime(name),
        dataBase64: btoa(""),
      });
      setNewFileName("");
      setShowNewFile(false);
      toast.success(`Created ${name}`);
      void loadFiles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create file");
    }
  };

  const handleCreateFolder = async () => {
    const name = newFolderName.trim().replace(/\/+$/, "");
    if (!name) return;
    // Create a placeholder .gitkeep to establish the folder
    try {
      await sendMessage({
        type: "FILE_SAVE",
        projectId,
        filename: `${name}/.gitkeep`,
        mimeType: "text/plain",
        dataBase64: btoa(""),
      });
      setNewFolderName("");
      setShowNewFolder(false);
      toast.success(`Created folder ${name}/`);
      void loadFiles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create folder");
    }
  };

  const handleRename = async () => {
    if (!selectedFile || !renameValue.trim()) return;
    const newName = renameValue.trim();
    if (newName === selectedFile.filename) {
      setRenaming(false);
      return;
    }
    setSaving(true);
    try {
      // Save with new name using existing content
      await sendMessage({
        type: "FILE_SAVE",
        projectId,
        filename: newName,
        mimeType: selectedFile.mimeType || guessMime(newName),
        dataBase64: btoa(editedContent),
      });
      // Delete old file
      await sendMessage({ type: "FILE_DELETE", fileId: selectedFile.id });
      setSelectedFile(null);
      setRenaming(false);
      toast.success(`Renamed to ${newName}`);
      void loadFiles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Rename failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDownload = () => {
    if (!selectedFile) return;
    const blob = new Blob([editedContent], { type: selectedFile.mimeType || "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = selectedFile.filename.split("/").pop() ?? selectedFile.filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  /* ── Upload handlers ── */

  const uploadFiles = async (fileList: globalThis.File[], prefix = "") => {
    let count = 0;
    for (const file of fileList) {
      try {
        const base64 = await readFileAsBase64(file);
        const filename = prefix ? `${prefix}/${file.name}` : file.name;
        await sendMessage({
          type: "FILE_SAVE",
          projectId,
          filename,
          mimeType: file.type || guessMime(file.name),
          dataBase64: base64,
        });
        count++;
      } catch (err) {
        toast.error(`Failed to upload ${file.name}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
    if (count > 0) {
      toast.success(`Uploaded ${count} file(s)`);
      void loadFiles();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const inputFiles = e.target.files;
    if (!inputFiles || inputFiles.length === 0) return;
    void uploadFiles(Array.from(inputFiles));
    e.target.value = "";
  };

  const handleDropOnFolder = (droppedFiles: globalThis.File[], targetDir: string) => {
    void uploadFiles(droppedFiles, targetDir);
  };

  const handleMoveFile = async (sourcePath: string, targetDir: string) => {
    const sourceFile = files.find((f) => f.filename === sourcePath);
    if (!sourceFile) return;
    const baseName = sourcePath.split("/").pop() ?? sourcePath;
    const newPath = targetDir ? `${targetDir}/${baseName}` : baseName;
    if (newPath === sourcePath) return;
    try {
      // Read file content
      const result = await sendMessage<{ dataBase64?: string; data?: string }>({
        type: "FILE_GET",
        fileId: sourceFile.id,
      });
      const dataBase64 = result.dataBase64 ?? (result.data ? btoa(result.data) : btoa(""));
      // Save at new path
      await sendMessage({
        type: "FILE_SAVE",
        projectId,
        filename: newPath,
        mimeType: sourceFile.mimeType || guessMime(newPath),
        dataBase64,
      });
      // Delete old
      await sendMessage({ type: "FILE_DELETE", fileId: sourceFile.id });
      if (selectedFile?.id === sourceFile.id) {
        setSelectedFile(null);
      }
      toast.success(`Moved to ${newPath}`);
      void loadFiles();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Move failed");
    }
  };

  const handleRootDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setRootDragOver(true);
  };

  const handleRootDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
    setRootDragOver(false);
  };

  const handleRootDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setRootDragOver(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    if (droppedFiles.length > 0) {
      void uploadFiles(droppedFiles);
    }
  };

  const handleToggleDir = (path: string) => {
    setExpandedDirs((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const totalSize = files.reduce((sum, f) => sum + (f.size || 0), 0);

  return (
    <div className="border border-border rounded-lg overflow-hidden" style={{ height: "500px" }}>
      {/* Hidden file input for upload */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={handleFileInputChange}
      />

      <div className="flex h-full">
        {/* File tree sidebar */}
        <div
          className={`w-56 border-r border-border flex flex-col bg-muted/20 transition-colors ${
            rootDragOver ? "bg-primary/5 ring-1 ring-inset ring-primary/30" : ""
          }`}
          onDragOver={handleRootDragOver}
          onDragLeave={handleRootDragLeave}
          onDrop={handleRootDrop}
        >
          <div className="flex items-center justify-between px-2 py-1.5 border-b border-border">
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">Files</span>
            <div className="flex gap-0.5">
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => fileInputRef.current?.click()} title="Upload files">
                <Upload className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setShowNewFile(!showNewFile); setShowNewFolder(false); }} title="New file">
                <Plus className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => { setShowNewFolder(!showNewFolder); setShowNewFile(false); }} title="New folder">
                <FolderPlus className="h-3 w-3" />
              </Button>
              <Button variant="ghost" size="icon" className="h-6 w-6" onClick={loadFiles} disabled={loading} title="Refresh">
                <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>

          {showNewFile && (
            <div className="flex gap-1 p-1.5 border-b border-border">
              <Input
                value={newFileName}
                onChange={(e) => setNewFileName(e.target.value)}
                placeholder="path/to/file.txt"
                className="h-6 text-[11px]"
                onKeyDown={(e) => e.key === "Enter" && handleCreateFile()}
                autoFocus
              />
              <Button size="icon" className="h-6 w-6 shrink-0" onClick={handleCreateFile} disabled={!newFileName.trim()}>
                <Plus className="h-3 w-3" />
              </Button>
            </div>
          )}

          {showNewFolder && (
            <div className="flex gap-1 p-1.5 border-b border-border">
              <Input
                value={newFolderName}
                onChange={(e) => setNewFolderName(e.target.value)}
                placeholder="folder-name"
                className="h-6 text-[11px]"
                onKeyDown={(e) => e.key === "Enter" && handleCreateFolder()}
                autoFocus
              />
              <Button size="icon" className="h-6 w-6 shrink-0" onClick={handleCreateFolder} disabled={!newFolderName.trim()}>
                <FolderPlus className="h-3 w-3" />
              </Button>
            </div>
          )}

          <ScrollArea className="flex-1">
            <div className="py-1">
              {loading ? (
                <div className="text-[10px] text-muted-foreground text-center py-4">Loading…</div>
              ) : tree.length === 0 ? (
                <div className="text-[10px] text-muted-foreground text-center py-8 px-4 space-y-2">
                  <Upload className="h-6 w-6 mx-auto opacity-30" />
                  <p>No files yet</p>
                  <p className="text-[9px]">Drop files here or click Upload</p>
                </div>
              ) : (
                tree.map((node) => (
                  <TreeNode
                    key={node.path}
                    node={node}
                    depth={0}
                    selectedPath={selectedFile?.filename ?? null}
                    expandedDirs={expandedDirs}
                    onSelect={handleSelectFile}
                    onToggleDir={handleToggleDir}
                    onDrop={handleDropOnFolder}
                    onMoveFile={handleMoveFile}
                  />
                ))
              )}
            </div>
          </ScrollArea>

          <div className="border-t border-border px-2 py-1 flex items-center justify-between">
            <span className="text-[10px] text-muted-foreground">{files.length} file(s)</span>
            <span className="text-[10px] text-muted-foreground">{formatSize(totalSize)}</span>
          </div>
        </div>

        {/* Editor area */}
        <div className="flex-1 flex flex-col min-w-0">
          {selectedFile ? (
            <>
              <div className="flex items-center justify-between px-3 py-1.5 border-b border-border bg-muted/10">
                <div className="flex items-center gap-2 min-w-0 flex-1">
                  <File className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  {renaming ? (
                    <div className="flex items-center gap-1 flex-1 min-w-0">
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="h-6 text-[11px] font-mono flex-1"
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void handleRename();
                          if (e.key === "Escape") setRenaming(false);
                        }}
                        autoFocus
                      />
                      <Button size="icon" variant="ghost" className="h-6 w-6 shrink-0" onClick={() => void handleRename()}>
                        <Save className="h-3 w-3" />
                      </Button>
                    </div>
                  ) : (
                    <>
                      <span className="text-xs font-mono truncate">{selectedFile.filename}</span>
                      {isDirty && <span className="text-[10px] text-primary font-medium shrink-0">● Modified</span>}
                    </>
                  )}
                </div>
                <div className="flex items-center gap-0.5 shrink-0 ml-2">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={() => { setRenaming(true); setRenameValue(selectedFile.filename); }}
                    title="Rename"
                  >
                    <Pencil className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7"
                    onClick={handleDownload}
                    title="Download"
                  >
                    <Download className="h-3 w-3" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs gap-1"
                    onClick={handleSave}
                    disabled={saving || !isDirty}
                  >
                    <Save className="h-3 w-3" />
                    {saving ? "Saving…" : "Save"}
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive hover:text-destructive" title="Delete file">
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Delete file?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Delete "{selectedFile.filename}" permanently?
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction onClick={() => handleDelete(selectedFile.id)}>Delete</AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              </div>
              <div className="flex-1 min-h-0 overflow-auto">
                {rawBase64 && isBinaryFile(selectedFile.filename) ? (
                  <div className="flex items-center justify-center h-full p-4 bg-muted/5">
                    {isImageFile(selectedFile.filename) ? (
                      <img
                        src={buildDataUrl(rawBase64, selectedFile.mimeType || "image/png")}
                        alt={selectedFile.filename}
                        className="max-w-full max-h-full object-contain rounded-md border border-border shadow-sm"
                      />
                    ) : isPdfFile(selectedFile.filename) ? (
                      <iframe
                        src={buildDataUrl(rawBase64, "application/pdf")}
                        title={selectedFile.filename}
                        className="w-full h-full rounded-md border border-border"
                      />
                    ) : (
                      <div className="text-center space-y-3 text-muted-foreground">
                        <FileQuestion className="h-12 w-12 mx-auto opacity-40" />
                        <p className="text-sm font-medium">{selectedFile.filename.split("/").pop()}</p>
                        <p className="text-xs">Binary file — no preview available</p>
                        <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={handleDownload}>
                          <Download className="h-3.5 w-3.5" />
                          Download to view
                        </Button>
                      </div>
                    )}
                  </div>
                ) : (
                  <MonacoCodeEditor
                    language={getLanguage(selectedFile.filename)}
                    value={editedContent}
                    onChange={(v) => {
                      setEditedContent(v);
                      setIsDirty(v !== fileContent);
                    }}
                    height="100%"
                  />
                )}
              </div>
              {/* File info bar */}
              <div className="flex items-center gap-4 px-3 py-1 border-t border-border text-[10px] text-muted-foreground bg-muted/5">
                <span>{formatSize(selectedFile.size)}</span>
                <span>{selectedFile.mimeType}</span>
                <span className="ml-auto">Updated {new Date(selectedFile.updatedAt).toLocaleDateString()}</span>
              </div>
            </>
          ) : (
            <div
              className={`flex-1 flex items-center justify-center text-xs text-muted-foreground transition-colors ${
                rootDragOver ? "bg-primary/5" : ""
              }`}
            >
              <div className="text-center space-y-2">
                <Upload className="h-8 w-8 mx-auto opacity-30" />
                <p>Select a file or drag & drop to upload</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs gap-1.5"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Upload className="h-3.5 w-3.5" />
                  Upload Files
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
