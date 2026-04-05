/**
 * OPFS Session Browser Panel — Diagnostics
 *
 * Lists all OPFS session directories and their files with absolute paths.
 * @see spec/05-chrome-extension/06-logging-architecture.md
 */

import { useState, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { sendMessage } from "@/lib/message-client";
import {
    FolderOpen,
    FileText,
    RefreshCw,
    ChevronRight,
    HardDrive,
    AlertTriangle,
    ClipboardCopy,
    Check,
} from "lucide-react";
import { toast } from "sonner";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface SessionFileInfo {
    name: string;
    absolutePath: string;
    sizeBytes: number;
    lastModified: string;
}

interface SessionDirInfo {
    sessionId: string;
    absolutePath: string;
    files: SessionFileInfo[];
    totalSizeBytes: number;
}

interface OpfsSessionBrowseResponse {
    rootPath: string;
    sessions: SessionDirInfo[];
    totalSessions: number;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatBytes(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatTimestamp(iso: string): string {
    try {
        const d = new Date(iso);
        return d.toLocaleString();
    } catch {
        return iso;
    }
}

/* ------------------------------------------------------------------ */
/*  Sub-components                                                     */
/* ------------------------------------------------------------------ */

function SessionFileRow({ file }: { file: SessionFileInfo }) {
    return (
        <div className="flex items-center gap-2 py-1 px-2 rounded text-[11px] font-mono bg-muted/30">
            <FileText className="h-3 w-3 shrink-0 text-muted-foreground" />
            <span className="truncate flex-1 text-foreground" title={file.absolutePath}>
                {file.absolutePath}
            </span>
            <Badge variant="outline" className="text-[10px] shrink-0">
                {formatBytes(file.sizeBytes)}
            </Badge>
            <span className="text-muted-foreground text-[10px] shrink-0">
                {formatTimestamp(file.lastModified)}
            </span>
        </div>
    );
}

function SessionDirRow({ session }: { session: SessionDirInfo }) {
    const [open, setOpen] = useState(false);
    const fileCount = session.files.length;
    const hasFiles = fileCount > 0;

    return (
        <Collapsible open={open} onOpenChange={setOpen}>
            <CollapsibleTrigger asChild>
                <button
                    type="button"
                    className="flex items-center gap-2 w-full py-1.5 px-2 rounded text-left text-xs hover:bg-muted/50 transition-colors"
                >
                    <ChevronRight
                        className={`h-3 w-3 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-90" : ""}`}
                    />
                    <FolderOpen className="h-3.5 w-3.5 shrink-0 text-primary" />
                    <span className="font-mono truncate flex-1" title={session.absolutePath}>
                        {session.absolutePath}
                    </span>
                    <Badge variant="secondary" className="text-[10px] shrink-0">
                        {fileCount} file{fileCount !== 1 ? "s" : ""}
                    </Badge>
                    <Badge variant="outline" className="text-[10px] shrink-0">
                        {formatBytes(session.totalSizeBytes)}
                    </Badge>
                </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
                <div className="ml-5 mt-1 space-y-0.5 border-l-2 border-muted pl-2">
                    {hasFiles ? (
                        session.files.map((file) => (
                            <SessionFileRow key={file.name} file={file} />
                        ))
                    ) : (
                        <div className="flex items-center gap-1.5 py-1 px-2 text-[11px] text-muted-foreground">
                            <AlertTriangle className="h-3 w-3" />
                            No files found in this session directory
                        </div>
                    )}
                </div>
            </CollapsibleContent>
        </Collapsible>
    );
}

/* ------------------------------------------------------------------ */
/*  Main Panel                                                         */
/* ------------------------------------------------------------------ */

// eslint-disable-next-line max-lines-per-function
export function OpfsSessionBrowserPanel() {
    const [data, setData] = useState<OpfsSessionBrowseResponse | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);

    const refresh = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const result = await sendMessage<OpfsSessionBrowseResponse>({
                type: "BROWSE_OPFS_SESSIONS" as never,
            });
            setData(result);
        } catch (err) {
            const msg = err instanceof Error ? err.message : "Failed to browse OPFS sessions";
            setError(msg);
        } finally {
            setLoading(false);
        }
    }, []);

    const handleCopy = useCallback(() => {
        if (!data) return;

        const lines: string[] = [
            `OPFS Session Directory Browser`,
            `Root: ${data.rootPath}`,
            `Total sessions: ${data.totalSessions}`,
            `Generated: ${new Date().toISOString()}`,
            "─".repeat(60),
        ];

        for (const session of data.sessions) {
            lines.push("");
            lines.push(`📁 ${session.absolutePath}  (${formatBytes(session.totalSizeBytes)})`);
            if (session.files.length === 0) {
                lines.push("   ⚠ (empty — no files)");
            } else {
                for (const file of session.files) {
                    lines.push(`   📄 ${file.absolutePath}  ${formatBytes(file.sizeBytes)}  ${file.lastModified}`);
                }
            }
        }

        navigator.clipboard.writeText(lines.join("\n")).then(() => {
            setCopied(true);
            toast.success("OPFS session tree copied to clipboard");
            setTimeout(() => setCopied(false), 2000);
        }).catch(() => toast.error("Copy failed"));
    }, [data]);

    const hasSessions = data !== null && data.sessions.length > 0;

    return (
        <Card>
            <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground flex items-center gap-2">
                    <HardDrive className="h-4 w-4" />
                    OPFS Session Browser
                </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
                <div className="flex items-center gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-[10px] gap-1.5"
                        onClick={refresh}
                        disabled={loading}
                    >
                        <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
                        {loading ? "Scanning…" : "Scan OPFS"}
                    </Button>
                    {hasSessions && (
                        <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-[10px] gap-1.5"
                            onClick={handleCopy}
                        >
                            {copied ? <Check className="h-3 w-3 text-primary" /> : <ClipboardCopy className="h-3 w-3" />}
                            {copied ? "Copied!" : "Copy Tree"}
                        </Button>
                    )}
                    {data && (
                        <Badge variant="secondary" className="text-[10px]">
                            {data.totalSessions} session{data.totalSessions !== 1 ? "s" : ""}
                        </Badge>
                    )}
                </div>

                {data?.rootPath && (
                    <div className="text-[10px] text-muted-foreground font-mono">
                        Root: {data.rootPath}
                    </div>
                )}

                {error && (
                    <div className="flex items-center gap-1.5 text-[11px] text-destructive">
                        <AlertTriangle className="h-3 w-3" />
                        {error}
                    </div>
                )}

                {hasSessions && (
                    <ScrollArea className="max-h-[320px]">
                        <div className="space-y-0.5">
                            {data.sessions.map((session) => (
                                <SessionDirRow key={session.sessionId} session={session} />
                            ))}
                        </div>
                    </ScrollArea>
                )}

                {data && !hasSessions && !error && (
                    <div className="text-[11px] text-muted-foreground text-center py-4">
                        No session directories found in OPFS.
                    </div>
                )}

                {!data && !loading && !error && (
                    <div className="text-[11px] text-muted-foreground text-center py-4">
                        Click "Scan OPFS" to list all session directories and files.
                    </div>
                )}
            </CardContent>
        </Card>
    );
}
