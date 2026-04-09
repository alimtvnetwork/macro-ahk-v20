/**
 * Hook: useLibraryLinkMap
 *
 * Fetches all SharedAssets and AssetLinks, then builds a lookup map
 * of asset slug → { linkState, pinnedVersion } for a given project.
 *
 * Used by PromptRow and ScriptEntryCard to show inline SyncBadge.
 */

import { useEffect, useState, useCallback, useMemo } from "react";
import { sendMessage } from "@/lib/message-client";

type LinkState = "synced" | "pinned" | "detached";

interface LinkInfo {
  state: LinkState;
  pinnedVersion: string | null;
}

interface SharedAssetMinimal {
  Id: number;
  Slug: string;
  Type: string;
}

interface AssetLinkMinimal {
  SharedAssetId: number;
  ProjectId: number;
  LinkState: LinkState;
  PinnedVersion: string | null;
}

export type LibraryLinkMap = Map<string, LinkInfo>;

export function useLibraryLinkMap(projectId: number | null): {
  linkMap: LibraryLinkMap;
  loading: boolean;
} {
  const [assets, setAssets] = useState<SharedAssetMinimal[]>([]);
  const [links, setLinks] = useState<AssetLinkMinimal[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    try {
      const [assetsRes, linksRes] = await Promise.all([
        sendMessage<{ assets: SharedAssetMinimal[] }>({ type: "LIBRARY_GET_ASSETS" as never }),
        sendMessage<{ links: AssetLinkMinimal[] }>({ type: "LIBRARY_GET_LINKS" as never }),
      ]);
      setAssets(assetsRes.assets ?? []);
      setLinks(linksRes.links ?? []);
    } catch {
      // silently fail — badges are non-critical
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  const linkMap = useMemo(() => {
    const map = new Map<string, LinkInfo>();
    if (!projectId) return map;

    const projectLinks = links.filter(l => l.ProjectId === projectId);
    const assetById = new Map(assets.map(a => [a.Id, a]));

    for (const link of projectLinks) {
      const asset = assetById.get(link.SharedAssetId);
      if (asset) {
        map.set(asset.Slug, { state: link.LinkState, pinnedVersion: link.PinnedVersion });
      }
    }
    return map;
  }, [assets, links, projectId]);

  return { linkMap, loading };
}
