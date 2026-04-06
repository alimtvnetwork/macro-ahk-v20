/**
 * EXT-03: Lazy-loaded Monaco Code Editor wrapper.
 * Defers the ~2MB Monaco bundle until the editor is actually rendered.
 */
import { lazy, Suspense } from "react";

const MonacoCodeEditorLazy = lazy(() =>
  import("./MonacoCodeEditor").then((m) => ({ default: m.MonacoCodeEditor }))
);

interface Props {
  value: string;
  onChange: (v: string) => void;
  language: "javascript" | "json" | "markdown";
  height?: string;
  readOnly?: boolean;
}

function EditorFallback({ height = "240px" }: { height?: string }) {
  return (
    <div
      className="flex items-center justify-center rounded-md border border-border bg-muted/30 text-muted-foreground text-sm"
      style={{ height }}
    >
      Loading editor…
    </div>
  );
}

export function MonacoCodeEditor(props: Props) {
  return (
    <Suspense fallback={<EditorFallback height={props.height} />}>
      <MonacoCodeEditorLazy {...props} />
    </Suspense>
  );
}
