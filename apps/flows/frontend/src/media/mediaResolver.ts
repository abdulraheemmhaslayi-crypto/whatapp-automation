/**
 * Media Resolver & Cache for Flow Builder
 * - Caches media library assets (UUID -> MediaAsset)
 * - Automatically resolves media_id to viewable delivery URLs in Preview & StepEditor
 * - Background fetches media library when un-cached media_ids are encountered
 */
import { useEffect, useState } from "react";
import type { BuilderEnv } from "../env";
import type { MediaAsset } from "../schema/types";
import { fetchPicker } from "../api/flows";

const assetCache = new Map<string, MediaAsset>();
const listeners = new Set<() => void>();
let isFetchingAll = false;
let hasFetchedInitial = false;

function notifyListeners() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore
    }
  });
}

export function cacheMediaAsset(asset: MediaAsset) {
  if (!asset || !asset.id) return;
  assetCache.set(asset.id, asset);
  notifyListeners();
}

export function cacheMediaAssets(assets: MediaAsset[]) {
  if (!Array.isArray(assets) || assets.length === 0) return;
  assets.forEach((a) => {
    if (a && a.id) {
      assetCache.set(a.id, a);
    }
  });
  notifyListeners();
}

export function getCachedMediaAsset(id?: string): MediaAsset | undefined {
  if (!id) return undefined;
  return assetCache.get(id);
}

/**
 * Hook to resolve any media block (by mediaId or direct URL) to an active deliverable URL.
 */
export function useResolvedMedia(
  mediaId?: string,
  directUrl?: string,
  env?: BuilderEnv
): { url: string; asset?: MediaAsset } {
  const [, setTick] = useState(0);

  useEffect(() => {
    const handleUpdate = () => setTick((t) => t + 1);
    listeners.add(handleUpdate);
    return () => {
      listeners.delete(handleUpdate);
    };
  }, []);

  // If a direct URL (HTTPS, blob:, data:) is already provided, return it
  if (directUrl && typeof directUrl === "string" && directUrl.trim()) {
    return { url: directUrl.trim(), asset: mediaId ? assetCache.get(mediaId) : undefined };
  }

  if (mediaId && typeof mediaId === "string") {
    const cached = assetCache.get(mediaId);
    if (cached) {
      const bestUrl = cached.url || cached.thumbnail_url || "";
      return { url: bestUrl, asset: cached };
    }

    // If not cached, trigger fetchPicker once in background
    if (env && env.mediaPickerUrl && !isFetchingAll && !hasFetchedInitial) {
      isFetchingAll = true;
      fetchPicker(env, { limit: "100" as any })
        .then((payload) => {
          isFetchingAll = false;
          hasFetchedInitial = true;
          if (payload && Array.isArray(payload.results)) {
            cacheMediaAssets(payload.results);
          }
        })
        .catch(() => {
          isFetchingAll = false;
        });
    }
  }

  return { url: "" };
}
