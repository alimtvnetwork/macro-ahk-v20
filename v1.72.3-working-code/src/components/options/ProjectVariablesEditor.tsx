import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JsonTreeEditor } from "./JsonTreeEditor";
import { Braces, Code } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Props {
  variables: string;
  onChange: (json: string) => void;
}

/* ------------------------------------------------------------------ */
/*  Component                                                          */
/* ------------------------------------------------------------------ */

export function ProjectVariablesEditor({ variables, onChange }: Props) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">
          <Braces className="inline h-4 w-4 mr-1.5" />
          Injection Variables
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="tree" className="w-full">
          <TabsList className="h-8 w-fit">
            <TabsTrigger value="tree" className="text-xs h-6 px-2 gap-1">
              <Braces className="h-3 w-3" /> Tree
            </TabsTrigger>
            <TabsTrigger value="raw" className="text-xs h-6 px-2 gap-1">
              <Code className="h-3 w-3" /> Raw JSON
            </TabsTrigger>
          </TabsList>
          <TabsContent value="tree" className="mt-3">
            <JsonTreeEditor value={variables} onChange={onChange} />
          </TabsContent>
          <TabsContent value="raw" className="mt-3">
            <RawJsonEditor variables={variables} onChange={onChange} />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------------ */
/*  Raw JSON sub-editor                                                */
/* ------------------------------------------------------------------ */

interface RawJsonEditorProps {
  variables: string;
  onChange: (json: string) => void;
}

function RawJsonEditor({ variables, onChange }: RawJsonEditorProps) {
  const isInvalid = isInvalidJson(variables);

  return (
    <div>
      <Textarea
        value={variables}
        onChange={(e) => onChange(e.target.value)}
        className="font-mono text-xs min-h-[120px]"
        placeholder='{ "key": "value" }'
      />
      {isInvalid && (
        <p className="text-[10px] text-destructive mt-1">Invalid JSON</p>
      )}
    </div>
  );
}

/** Checks if a string is invalid JSON. */
function isInvalidJson(str: string): boolean {
  try {
    JSON.parse(str);
    return false;
  } catch (jsonParseError: unknown) {
    return true;
  }
}
