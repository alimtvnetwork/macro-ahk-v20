import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useXPathRecorder } from "@/hooks/use-extension-data";
import { Crosshair, Trash2, Copy, Play, Square, Save } from "lucide-react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { useState, useEffect } from "react";

interface XPathPanelProps {
  chatBoxXPath?: string;
  onSaveChatBoxXPath?: (xpath: string) => void;
}

export function XPathPanel({ chatBoxXPath, onSaveChatBoxXPath }: XPathPanelProps = {}) {
  const { recorded, isRecording, loading, toggle, clear } = useXPathRecorder();
  const [localXPath, setLocalXPath] = useState(chatBoxXPath ?? "");

  useEffect(() => {
    setLocalXPath(chatBoxXPath ?? "");
  }, [chatBoxXPath]);

  const handleCopy = (xpath: string) => {
    navigator.clipboard.writeText(xpath);
    toast.success("XPath copied to clipboard");
  };

  const handleSaveXPath = () => {
    if (onSaveChatBoxXPath) {
      onSaveChatBoxXPath(localXPath);
      toast.success("ChatBox XPath saved to project");
    }
  };

  return (
    <div className="space-y-4">
      {/* Project-level ChatBox XPath */}
      {onSaveChatBoxXPath && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
              <Crosshair className="inline h-4 w-4 mr-1.5" />
              Chatbox XPath (Project)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-[10px] text-muted-foreground">
              XPath to the chat input element. Overrides the global default for this project.
            </p>
            <div className="flex gap-2 items-center">
              <Input
                value={localXPath}
                onChange={(e) => setLocalXPath(e.target.value)}
                className="flex-1 h-8 text-xs font-mono"
                placeholder="/html/body/..."
              />
              <Button size="sm" onClick={handleSaveXPath}>
                <Save className="h-3.5 w-3.5 mr-1.5" />
                Save
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* XPath Recorder */}
      <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          <Crosshair className="inline h-4 w-4 mr-1.5" />
          XPath Recorder
        </CardTitle>
        <div className="flex gap-2">
          <Button
            variant={isRecording ? "destructive" : "default"}
            size="sm"
            onClick={toggle}
            disabled={loading}
          >
            {isRecording ? (
              <>
                <Square className="h-3.5 w-3.5 mr-1.5" />
                Stop
              </>
            ) : (
              <>
                <Play className="h-3.5 w-3.5 mr-1.5" />
                Record
              </>
            )}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={clear}
            disabled={recorded.length === 0}
          >
            <Trash2 className="h-3.5 w-3.5 mr-1.5" />
            Clear
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {isRecording && (
          <div className="mb-3 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2">
            <span className="h-2 w-2 rounded-full bg-destructive animate-pulse" />
            <span className="text-xs text-destructive font-medium">
              Recording — click elements in the target tab
            </span>
          </div>
        )}

        {recorded.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            No XPaths recorded. Use Ctrl+Shift+R or click Record to start.
          </div>
        ) : (
          <div className="rounded-md border overflow-auto max-h-[320px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">Strategy</TableHead>
                  <TableHead className="w-20">Tag</TableHead>
                  <TableHead>XPath</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {recorded.map((entry, i) => (
                  <TableRow key={i}>
                    <TableCell>
                      <StrategyBadge strategy={entry.strategy} />
                    </TableCell>
                    <TableCell className="text-xs font-mono">
                      {entry.tagName}
                    </TableCell>
                    <TableCell className="text-xs font-mono max-w-[300px] truncate">
                      {entry.xpath}
                    </TableCell>
                    <TableCell>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => handleCopy(entry.xpath)}
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
      </Card>
    </div>
  );
}

function StrategyBadge({ strategy }: { strategy: string }) {
  const colors: Record<string, string> = {
    id: "bg-[hsl(var(--success))]/15 text-[hsl(var(--success))]",
    testid: "bg-primary/15 text-primary",
    "role-text": "bg-[hsl(var(--warning))]/15 text-[hsl(var(--warning))]",
    positional: "bg-muted text-muted-foreground",
  };

  return (
    <Badge
      variant="outline"
      className={`text-[10px] px-1.5 py-0 ${colors[strategy] ?? "bg-muted text-muted-foreground"}`}
    >
      {strategy}
    </Badge>
  );
}
