import { useEffect, useMemo, useRef, useState } from "react";

export type OnMount = (
  editor: { getAction: (actionId: string) => { run: () => void } | null },
  monaco: unknown
) => void;

interface MonacoFallbackProps {
  height?: string | number;
  language?: string;
  value?: string;
  onChange?: (value: string | undefined) => void;
  onMount?: OnMount;
  theme?: string;
  options?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Extension-only Monaco fallback — textarea-based editor that handles all
 * props that the real Monaco Editor component receives, preventing crashes
 * from unexpected/missing prop handling.
 */
export default function MonacoEditorFallback({
  height = "240px",
  language,
  value,
  onChange,
  onMount,
  options,
}: MonacoFallbackProps) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [internalValue, setInternalValue] = useState(value ?? "");

  // Sync external value changes
  useEffect(() => {
    setInternalValue(value ?? "");
  }, [value]);

  const readOnly = typeof options?.readOnly === "boolean" ? options.readOnly : false;

  const editorApi = useMemo(
    () => ({
      getAction: (_actionId: string) => ({
        run: () => {
          // Format action: attempt JSON formatting
          if (language === "json" && textareaRef.current) {
            try {
              const formatted = JSON.stringify(JSON.parse(textareaRef.current.value), null, 2);
              setInternalValue(formatted);
              onChange?.(formatted);
            } catch {
              // invalid JSON, ignore
            }
          }
        },
      }),
    }),
    [language, onChange]
  );

  useEffect(() => {
    try {
      onMount?.(editorApi, {});
    } catch {
      // Prevent onMount errors from crashing the UI
    }
  }, [editorApi, onMount]);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    setInternalValue(newValue);
    try {
      onChange?.(newValue);
    } catch {
      // Prevent onChange errors from crashing
    }
  };

  const resolvedHeight = typeof height === "number" ? `${height}px` : height;

  return (
    <textarea
      ref={textareaRef}
      value={internalValue}
      onChange={handleChange}
      readOnly={readOnly}
      spellCheck={false}
      className="w-full p-3 font-mono text-xs bg-background text-foreground border-0 outline-none resize-none"
      style={{
        height: resolvedHeight,
        minHeight: "120px",
        tabSize: 2,
      }}
      placeholder={language ? `Enter ${language} here…` : "Enter text here…"}
    />
  );
}
