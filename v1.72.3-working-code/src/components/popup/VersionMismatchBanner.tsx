/**
 * Marco Extension — Version Mismatch Banner
 *
 * Displays a compact warning when the extension manifest version
 * differs from the bundled macro-looping.js script version.
 * This usually means a rebuild/redeploy is needed.
 */

import { AlertTriangle, X } from "lucide-react";
import { useState } from "react";
import type { VersionCheckResult } from "@/hooks/use-version-check";

interface Props {
  versionCheck: VersionCheckResult;
}

export function VersionMismatchBanner({ versionCheck }: Props) {
  const [dismissed, setDismissed] = useState(false);

  if (dismissed || versionCheck.loading || !versionCheck.hasMismatch) {
    return null;
  }

  return (
    <div className="mx-4 mt-2 flex items-start gap-2 rounded-md border border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 px-3 py-2 text-xs">
      <AlertTriangle className="h-4 w-4 shrink-0 text-[hsl(var(--warning))] mt-0.5" />
      <div className="flex-1 space-y-0.5">
        <p className="font-semibold text-[hsl(var(--warning))]">
          Version mismatch detected
        </p>
        <p className="text-muted-foreground">
          Extension:{" "}
          <span className="font-mono font-medium text-foreground">
            v{versionCheck.manifestVersion}
          </span>
          {" · "}
          Bundled script:{" "}
          <span className="font-mono font-medium text-foreground">
            v{versionCheck.bundledScriptVersion}
          </span>
        </p>
        <p className="text-muted-foreground">
          Rebuild &amp; redeploy the extension to sync versions.
        </p>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="shrink-0 rounded p-0.5 text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
        aria-label="Dismiss"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}